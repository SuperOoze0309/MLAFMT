package com.superooze.mlafmt

import android.app.Activity
import android.app.Instrumentation.ActivityResult
import android.content.Intent
import android.webkit.WebView
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class OfflineAppTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun bundledPythonProducesMlaAndRejectsBrokenDocuments() {
        if (!Python.isStarted()) Python.start(AndroidPlatform(context))
        val builtins = Python.getInstance().getModule("builtins")
        val globals = builtins.callAttr("dict")
        globals.callAttr("__setitem__", "work", context.cacheDir.absolutePath)
        builtins.callAttr("exec", """
import json, os, zipfile
from docx import Document
from docx.oxml.ns import qn
from android_bridge import generate
draft = os.path.join(work, 'smoke.md')
with open(draft, 'w', encoding='utf-8') as f:
    f.write('First *italic* paragraph.\n\nSecond paragraph.\n\nWorks Cited\n\nZulu, Z. Book.\n\nAlpha, A. Book.')
request = dict(kind='convert', name='Jane Doe', title='Offline Essay', instructor='Professor Smith', course='ENG 101', date='13 October 2026')
response = json.loads(generate(json.dumps(request), draft, os.path.join(work, 'android-smoke')))
assert 'error' not in response, response
assert response['name'] == 'Doe_MLA_Essay.docx'
assert response['stats']['body'] == 2
assert response['stats']['works_cited'] == 2
doc = Document(response['path'])
assert doc.sections[0].page_width.inches == 8.5
assert doc.sections[0].top_margin.inches == 1.0
assert doc.styles['Normal'].font.name == 'Times New Roman'
assert doc.styles['Normal'].font.size.pt == 12
assert doc.sections[0].header.paragraphs[0]._p.xpath('.//w:instrText')[0].text.strip() == 'PAGE'
cited = next(p for p in doc.paragraphs if p.text == 'Works Cited')
assert cited.paragraph_format.page_break_before
assert doc.paragraphs[-2].text.startswith('Alpha')
assert doc.paragraphs[-1].paragraph_format.first_line_indent.inches == -0.5
bad = os.path.join(work, 'bad.docx')
with open(bad, 'wb') as f: f.write(b'not a docx')
assert json.loads(generate(json.dumps(request), bad, work))['error'] == 'bad_doc'
request['kind'] = 'blank'
blank = json.loads(generate(json.dumps(request), '', os.path.join(work, 'blank-smoke')))
assert Document(blank['path']).paragraphs[4].text == 'Offline Essay'
""".trimIndent(), globals)
    }

    @Test fun localPageSelectsConvertsAndSavesThroughSystemDocumentContracts() {
        val source = File(context.filesDir, "documents/test-source/draft.txt").apply {
            parentFile!!.mkdirs()
            writeText("Offline paragraph.\n\nWorks Cited\n\nDoe, Jane. Book.")
        }
        val destination = File(context.filesDir, "documents/test-destination/saved.docx").apply { parentFile!!.mkdirs() }
        val sourceUri = FileProvider.getUriForFile(context, "${context.packageName}.files", source)
        val outputUri = FileProvider.getUriForFile(context, "${context.packageName}.files", destination)
        Intents.init()
        try {
            Intents.intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(ActivityResult(Activity.RESULT_OK, Intent().setData(sourceUri)))
            Intents.intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(ActivityResult(Activity.RESULT_OK, Intent().setData(outputUri)))
            ActivityScenario.launch(MainActivity::class.java).use { scenario ->
                waitUntil(scenario, "Boolean(window.MLAFMTNative && document.getElementById('date').value)")
                scenario.onActivity { activity ->
                    val web = activity.findViewById<WebView>(R.id.webview)
                    assertEquals(MainActivity.PAGE, web.url)
                    assertFalse(web.settings.allowFileAccess)
                    assertFalse(web.settings.allowContentAccess)
                    assertTrue(web.settings.blockNetworkLoads)
                    web.evaluateJavascript("document.getElementById('drop').click()", null)
                }
                waitUntil(scenario, "document.getElementById('drop-title').textContent === 'draft.txt'")
                Intents.intended(hasAction(Intent.ACTION_OPEN_DOCUMENT))
                scenario.onActivity { activity ->
                    activity.findViewById<WebView>(R.id.webview).evaluateJavascript("document.getElementById('name').value='Jane Doe';document.getElementById('title').value='Android Essay';document.getElementById('convert').click()", null)
                }
                waitUntil(scenario, "!document.getElementById('native-actions').hidden && !document.getElementById('convert').disabled")
                // The result is retained through Activity recreation/backgrounding.
                scenario.recreate()
                waitUntil(scenario, "!document.getElementById('native-actions').hidden")
                scenario.onActivity { activity ->
                    val result = ViewModelProvider(activity)[DocumentViewModel::class.java].resultFile()
                    assertNotNull(result)
                    assertTrue(result!!.length() > 1000)
                    activity.findViewById<WebView>(R.id.webview).evaluateJavascript("document.getElementById('native-save').click()", null)
                }
                waitUntil(scenario, "document.getElementById('status').textContent.includes('saved') || document.getElementById('status').textContent.includes('已保存')")
                Intents.intended(hasAction(Intent.ACTION_CREATE_DOCUMENT))
                assertTrue(destination.length() > 1000)
            }
        } finally { Intents.release() }
    }

    private fun waitUntil(scenario: ActivityScenario<MainActivity>, expression: String) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(60)
        while (System.nanoTime() < deadline) {
            val latch = CountDownLatch(1)
            var success = false
            scenario.onActivity { activity ->
                activity.findViewById<WebView>(R.id.webview).evaluateJavascript(expression) { value ->
                    success = value == "true"
                    latch.countDown()
                }
            }
            latch.await(5, TimeUnit.SECONDS)
            if (success) return
            Thread.sleep(100)
        }
        var status = ""
        val diagnostic = CountDownLatch(1)
        scenario.onActivity { activity ->
            activity.findViewById<WebView>(R.id.webview).evaluateJavascript("document.getElementById('status').textContent") { value ->
                status = value
                diagnostic.countDown()
            }
        }
        diagnostic.await(5, TimeUnit.SECONDS)
        fail("Timed out waiting for: $expression; status=$status")
    }
}
