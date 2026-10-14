package com.superooze.mlafmt

import android.content.pm.ActivityInfo
import android.webkit.WebView
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.window.layout.FoldingFeature
import androidx.window.testing.layout.FoldingFeature as TestFoldingFeature
import androidx.window.testing.layout.TestWindowLayoutInfo
import androidx.window.testing.layout.WindowLayoutInfoPublisherRule
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class FoldableLayoutTest {
    @get:Rule val folds = WindowLayoutInfoPublisherRule()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext

    @Test fun foldResizeAndRotationRetainDraftOptionsAndCompletedDocument() {
        // Change the emulator's actual window metrics, rather than testing CSS alone.
        val density = context.resources.displayMetrics.density
        fun px(dips: Int) = (dips * density).toInt()
        shell("wm size ${px(1000)}x${px(1400)}")
        try {
            ActivityScenario.launch(MainActivity::class.java).use { scenario ->
                waitFor(scenario, "Boolean(window.MLAFMTNative && Number(document.documentElement.dataset.nativeWidth) > 800)")
                val draft = File(context.filesDir, "documents/fold-test/fold-draft.txt").apply {
                    parentFile!!.mkdirs()
                    writeText((1..3000).joinToString("\n\n") { "Fold test paragraph $it." })
                }
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", draft)
                scenario.onActivity { activity ->
                    activity.findViewById<WebView>(R.id.webview).evaluateJavascript("""
                        document.getElementById('name').value='Fold Tester';
                        document.getElementById('title').value='Flexible Essay';
                        for (const id of ['name','title']) document.getElementById(id).dispatchEvent(new Event('input'));
                        document.getElementById('o-bq').checked=true;
                        document.getElementById('o-bq').dispatchEvent(new Event('change'));
                    """.trimIndent(), null)
                    ViewModelProvider(activity)[DocumentViewModel::class.java].importDraft(uri)
                }
                waitFor(scenario, "document.getElementById('drop-title').textContent === 'fold-draft.txt' && !document.getElementById('convert').disabled")
                scenario.onActivity { activity ->
                    folds.overrideWindowLayoutInfo(TestWindowLayoutInfo(listOf(TestFoldingFeature(
                        activity = activity, size = px(24), state = FoldingFeature.State.HALF_OPENED,
                        orientation = FoldingFeature.Orientation.VERTICAL))))
                }
                waitFor(scenario, "document.documentElement.classList.contains('native-fold-vertical')")
                waitFor(scenario, "document.querySelector('.panel').getBoundingClientRect().right < parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fold-left')) && document.querySelector('.preview-column').getBoundingClientRect().left > parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fold-left')) + parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fold-size'))")
                waitFor(scenario, "getComputedStyle(document.querySelector('.panel')).overflowY === 'auto' && getComputedStyle(document.querySelector('.preview-column')).overflowY === 'auto'")
                scenario.onActivity { activity ->
                    val model = ViewModelProvider(activity)[DocumentViewModel::class.java]
                    model.generate(JSONObject().put("kind", "convert").put("name", "Fold Tester").put("title", "Flexible Essay"))
                    assertTrue(model.state.value!!.busy)
                    // Fold while the retained worker is processing the imported draft.
                    folds.overrideWindowLayoutInfo(TestWindowLayoutInfo(listOf(TestFoldingFeature(
                        activity = activity, size = px(20), state = FoldingFeature.State.HALF_OPENED,
                        orientation = FoldingFeature.Orientation.HORIZONTAL))))
                }
                // Recreate the Activity while Python is still formatting the long draft.
                scenario.recreate()
                scenario.onActivity { activity ->
                    folds.overrideWindowLayoutInfo(TestWindowLayoutInfo(listOf(TestFoldingFeature(
                        activity = activity, size = px(20), state = FoldingFeature.State.HALF_OPENED,
                        orientation = FoldingFeature.Orientation.HORIZONTAL))))
                }
                waitFor(scenario, "document.documentElement.classList.contains('native-fold-horizontal')")
                waitFor(scenario, "document.querySelector('.panel').getBoundingClientRect().bottom < parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fold-top')) && document.querySelector('.preview-column').getBoundingClientRect().top > parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fold-bottom'))")
                waitFor(scenario, "!document.getElementById('native-actions').hidden && !document.getElementById('convert').disabled")
                // A keyboard-sized viewport leaves a short pane below the hinge.
                // The form must stay in the larger pane, rather than crossing it.
                shell("wm size ${px(1000)}x${px(300)}")
                waitFor(scenario, "Number(document.documentElement.dataset.nativeHeight) < 400")
                scenario.onActivity { activity ->
                    val web = activity.findViewById<WebView>(R.id.webview)
                    val location = IntArray(2)
                    web.getLocationInWindow(location)
                    folds.overrideWindowLayoutInfo(TestWindowLayoutInfo(listOf(TestFoldingFeature(
                        activity = activity, center = px(210) + web.paddingTop + location[1], size = px(20),
                        state = FoldingFeature.State.HALF_OPENED, orientation = FoldingFeature.Orientation.HORIZONTAL))))
                }
                waitFor(scenario, "document.documentElement.classList.contains('native-fold-horizontal-single')")
                waitFor(scenario, "document.querySelector('.shell').getBoundingClientRect().bottom < parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fold-top'))")
                folds.overrideWindowLayoutInfo(TestWindowLayoutInfo())
                shell("wm size ${px(420)}x${px(1000)}")
                waitFor(scenario, "Number(document.documentElement.dataset.nativeWidth) < 600")
                waitFor(scenario, "getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns.split(' ').length === 1")
                scenario.onActivity { it.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE }
                waitFor(scenario, "Number(document.documentElement.dataset.nativeWidth) > 600")
                waitFor(scenario, "document.getElementById('name').value === 'Fold Tester' && document.getElementById('title').value === 'Flexible Essay' && document.getElementById('o-bq').checked && document.getElementById('drop-title').textContent === 'fold-draft.txt' && !document.getElementById('native-actions').hidden")
                scenario.recreate()
                waitFor(scenario, "document.getElementById('name').value === 'Fold Tester' && document.getElementById('title').value === 'Flexible Essay' && document.getElementById('o-bq').checked && document.getElementById('drop-title').textContent === 'fold-draft.txt' && !document.getElementById('native-actions').hidden")
                scenario.onActivity { activity ->
                    val model = ViewModelProvider(activity)[DocumentViewModel::class.java]
                    assertNotNull(model.resultFile())
                    assertEquals(3000, model.state.value!!.result!!.getJSONObject("stats").getInt("body"))
                    activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                }
            }
        } finally { shell("wm size reset") }
    }

    private fun shell(command: String) {
        instrumentation.uiAutomation.executeShellCommand(command).use { descriptor ->
            java.io.FileInputStream(descriptor.fileDescriptor).use { it.readBytes() }
        }
    }

    private fun waitFor(scenario: ActivityScenario<MainActivity>, expression: String) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(60)
        while (System.nanoTime() < deadline) {
            val latch = CountDownLatch(1)
            var passed = false
            scenario.onActivity { activity ->
                activity.findViewById<WebView>(R.id.webview).evaluateJavascript(expression) {
                    passed = it == "true"
                    latch.countDown()
                }
            }
            latch.await(5, TimeUnit.SECONDS)
            if (passed) return
            Thread.sleep(100)
        }
        val latch = CountDownLatch(1)
        var diagnostic = ""
        scenario.onActivity { activity ->
            activity.findViewById<WebView>(R.id.webview).evaluateJavascript("JSON.stringify({className:document.documentElement.className,width:document.documentElement.dataset.nativeWidth,height:document.documentElement.dataset.nativeHeight,fold:document.documentElement.dataset.nativeFold,status:document.getElementById('status').textContent})") {
                diagnostic = it
                latch.countDown()
            }
        }
        latch.await(5, TimeUnit.SECONDS)
        fail("Fold layout/state did not reach: $expression; $diagnostic")
    }
}
