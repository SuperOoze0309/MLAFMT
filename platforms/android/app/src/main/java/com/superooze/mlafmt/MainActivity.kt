package com.superooze.mlafmt

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.util.Locale

class MainActivity : ComponentActivity() {
    private val model: DocumentViewModel by viewModels()
    private lateinit var web: WebView
    private var pageReady = false
    private var foldingFeature: FoldingFeature? = null
    private val pick = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) model.importDraft(uri)
    }
    private val save = registerForActivityResult(ActivityResultContracts.CreateDocument(DOCX_MIME)) { uri ->
        val file = model.pendingSave
        model.pendingSave = null
        if (uri != null && file != null) model.saveDocument(uri, file)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            setContentView(TextView(this).apply {
                setText(R.string.update_webview)
                setPadding(32, 64, 32, 32)
            })
            return
        }
        web = WebView(this)
        web.setBackgroundColor(android.graphics.Color.rgb(246, 245, 241))
        web.id = R.id.webview
        setContentView(web)
        ViewCompat.setOnApplyWindowInsetsListener(web) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            sendLayout()
            insets
        }
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = false
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = false
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            blockNetworkLoads = true
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = request.url.toString() != PAGE
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                if (request.url.toString() in setOf(PAGE, MASCOT)) {
                    val response = assets.shouldInterceptRequest(request.url)
                    if (response != null) {
                        if (request.url.toString() == PAGE)
                            response.responseHeaders = mapOf("Content-Security-Policy" to "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'")
                        return response
                    }
                }
                return WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", emptyMap(), ByteArrayInputStream(ByteArray(0)))
            }
        }
        // Only messages from the exact bundled origin and its top-level frame are accepted.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "MLAFMTAndroid", setOf(ORIGIN)) { _, message, origin, mainFrame, _ ->
                if (mainFrame && origin.toString().trimEnd('/') == ORIGIN && web.url == PAGE) {
                    val payload = message.data ?: ""
                    if (payload.length <= 131072) handle(payload)
                }
            }
        }
        model.state.observe(this) { if (pageReady) sendState(it) }
        model.paragraphInspection.observe(this) { if (pageReady && it != null) deliver(it) }
        web.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> sendLayout() }
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                WindowInfoTracker.getOrCreate(this@MainActivity).windowLayoutInfo(this@MainActivity).collect { info ->
                    foldingFeature = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()
                    sendLayout()
                }
            }
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("(function(){var d=document.getElementById('adv');if(d&&d.open){d.close();return true;}return false;})()") { closed ->
                    if (closed != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        })
        web.loadUrl(PAGE)
    }

    private fun handle(payload: String) {
        try {
            val request = JSONObject(payload)
            when (request.optString("action")) {
                "ready" -> {
                    pageReady = true
                    val date = java.text.SimpleDateFormat("d MMMM yyyy", Locale.ENGLISH).format(java.util.Date())
                    deliver(JSONObject().put("type", "init").put("today", date))
                    sendState(model.state.value!!)
                    model.paragraphRestoration()?.let { deliver(it) }
                    sendLayout()
                }
                "pick" -> if (!model.state.value!!.busy) pick.launch(arrayOf(DOCX_MIME, "text/plain", "text/markdown", "text/x-markdown", "application/octet-stream"))
                "clear" -> model.clearDraft()
                "generate" -> model.generate(request.getJSONObject("data"))
                "paragraphs" -> model.inspectParagraphs(request.optJSONObject("data")?.optInt("request_id") ?: 0)
                "preservation" -> request.optJSONObject("data")?.let { model.updateParagraphPreservation(it) }
                "save" -> if (!model.state.value!!.busy) model.resultFile()?.let { file ->
                    model.pendingSave = file
                    save.launch(file.name)
                }
                "open" -> externalDocument(false)
                "share" -> externalDocument(true)
            }
        } catch (_: Exception) { model.error("failed") }
    }

    private fun externalDocument(share: Boolean) {
        if (model.state.value!!.busy) return
        val file = model.resultFile() ?: return
        val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
        val intent = if (share) Intent(Intent.ACTION_SEND).apply {
            type = DOCX_MIME
            putExtra(Intent.EXTRA_STREAM, uri)
        } else Intent(Intent.ACTION_VIEW).setDataAndType(uri, DOCX_MIME)
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        intent.clipData = ClipData.newRawUri("MLA document", uri)
        try {
            startActivity(if (share) Intent.createChooser(intent, null) else intent)
        } catch (_: android.content.ActivityNotFoundException) { model.error("no_document_app") }
    }

    private fun sendState(state: DocumentState) {
        val payload = JSONObject().put("type", "state").put("busy", state.busy)
        state.draft?.let { payload.put("file", JSONObject().put("id", it.file.name).put("name", it.name).put("size", it.size)) }
        state.result?.let { result ->
            // Private filesystem paths are never sent to JavaScript.
            payload.put("result", JSONObject(result.toString()).apply { remove("path") })
        }
        state.error?.let { payload.put("error", it) }
        state.message?.let { payload.put("message", it) }
        deliver(payload)
    }

    private fun deliver(payload: JSONObject) {
        if (!isDestroyed && pageReady) web.evaluateJavascript("window.MLAFMTNative.receive($payload)", null)
    }

    /** Window-relative hinge pixels become CSS dips in this WebView's content area. */
    private fun sendLayout() {
        if (!::web.isInitialized || !pageReady) return
        val density = resources.displayMetrics.density
        val location = IntArray(2)
        web.getLocationInWindow(location)
        val payload = JSONObject().put("type", "layout")
            .put("width", (web.width - web.paddingLeft - web.paddingRight) / density)
            .put("height", (web.height - web.paddingTop - web.paddingBottom) / density)
        foldingFeature?.let { feature ->
            val bounds = feature.bounds
            payload.put("fold", JSONObject()
                .put("left", (bounds.left - location[0] - web.paddingLeft) / density)
                .put("top", (bounds.top - location[1] - web.paddingTop) / density)
                .put("width", bounds.width() / density).put("height", bounds.height() / density)
                .put("vertical", feature.orientation == FoldingFeature.Orientation.VERTICAL)
                .put("separating", feature.isSeparating || feature.occlusionType == FoldingFeature.OcclusionType.FULL)
                .put("halfOpened", feature.state == FoldingFeature.State.HALF_OPENED))
        }
        deliver(payload)
    }

    override fun onDestroy() {
        if (::web.isInitialized) {
            pageReady = false
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))
                WebViewCompat.removeWebMessageListener(web, "MLAFMTAndroid")
            web.stopLoading()
            web.destroy()
        }
        super.onDestroy()
    }

    companion object {
        const val ORIGIN = "https://appassets.androidplatform.net"
        const val PAGE = "$ORIGIN/assets/index.html"
        const val MASCOT = "$ORIGIN/assets/static/capybara-64.png"
        const val DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }
}
