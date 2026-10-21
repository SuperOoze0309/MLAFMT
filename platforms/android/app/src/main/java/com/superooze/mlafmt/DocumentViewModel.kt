package com.superooze.mlafmt

import android.app.Application
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.SavedStateHandle
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

data class Draft(val file: File, val name: String, val size: Long)
data class DocumentState(
    val busy: Boolean = false,
    val draft: Draft? = null,
    val result: JSONObject? = null,
    val error: String? = null,
    val message: String? = null
)

/** Keeps processing alive across rotations without retaining an Activity or WebView. */
class DocumentViewModel(application: Application, private val saved: SavedStateHandle) : AndroidViewModel(application) {
    val state = MutableLiveData(restore())
    val paragraphInspection = MutableLiveData<JSONObject?>()
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var disposed = false
    var pendingSave: File?
        get() = saved.get<String>("pendingSave")?.let { File(it) }?.takeIf { validDocument(it) }
        set(value) { saved["pendingSave"] = value?.absolutePath }
    private val context get() = getApplication<Application>()

    private fun validDocument(file: File) = file.isFile && file.canonicalPath.startsWith(File(context.filesDir, "documents").canonicalPath + File.separator)

    private fun restore(): DocumentState {
        val path = saved.get<String>("draftPath")
        val draftFile = path?.let { File(it) }?.takeIf {
            it.isFile && it.canonicalPath.startsWith(File(context.cacheDir, "drafts").canonicalPath + File.separator)
        }
        val draft = draftFile?.let { Draft(it, saved.get<String>("draftName") ?: it.name, it.length()) }
        val result = saved.get<String>("result")?.let { JSONObject(it) }?.takeIf { validDocument(File(it.optString("path"))) }
        val interrupted = saved.get<Boolean>("busy") == true
        return DocumentState(draft = draft, result = result,
            error = if (interrupted) "interrupted" else null,
            message = if (result != null) "native_done" else if (draft != null) "file_ready" else "ready")
    }

    private fun publish(value: DocumentState) {
        if (!disposed) {
            saved["draftPath"] = value.draft?.file?.absolutePath
            saved["draftName"] = value.draft?.name
            saved["result"] = value.result?.toString()
            saved["busy"] = value.busy
            state.value = value
        }
    }

    private fun execute(task: () -> Unit) { worker.execute(task) }

    /** Draft exceptions survive a WebView recreation, but never become course-template settings. */
    fun updateParagraphPreservation(request: JSONObject) {
        val draft = state.value?.draft ?: return
        if (!draft.file.extension.equals("docx", true) || request.optString("file_id") != draft.file.name) return
        val ids = request.optJSONArray("preserve_paragraphs") ?: return
        if (!validParagraphIds(ids)) return
        if (ids.length() == 0) {
            saved.remove<String>("paragraphPreservation")
            return
        }
        val fingerprint = request.optString("source_fingerprint")
        if (!fingerprint.matches(Regex("[a-fA-F0-9]{64}"))) return
        val inspection = paragraphInspection.value ?: return
        if (inspection.optString("file_id") != draft.file.name ||
            !inspection.optString("source_fingerprint").equals(fingerprint, true)) return
        saved["paragraphPreservation"] = JSONObject().put("file_id", draft.file.name)
            .put("preserve_paragraphs", ids).put("source_fingerprint", fingerprint.lowercase()).toString()
    }

    private fun validParagraphIds(ids: JSONArray): Boolean = ids.length() <= 10000 &&
        (0 until ids.length()).all { index ->
            val value = ids.get(index)
            (value is Int || value is Long) && (value as Number).toLong() in 1L..Int.MAX_VALUE.toLong()
        }

    fun paragraphRestoration(): JSONObject? {
        val draft = state.value?.draft ?: return null
        val selection = try { saved.get<String>("paragraphPreservation")?.let { JSONObject(it) } }
            catch (_: Exception) { null } ?: return null
        val ids = selection.optJSONArray("preserve_paragraphs")
        if (!draft.file.extension.equals("docx", true) || selection.optString("file_id") != draft.file.name ||
            ids == null || ids.length() == 0 || !validParagraphIds(ids) ||
            !selection.optString("source_fingerprint").matches(Regex("[a-fA-F0-9]{64}"))) {
            saved.remove<String>("paragraphPreservation")
            return null
        }
        // Keep paragraph text out of SavedStateHandle; its cached inspection can be reused on rotation.
        paragraphInspection.value?.takeIf {
            it.optString("file_id") == draft.file.name &&
                it.optString("source_fingerprint").equals(selection.optString("source_fingerprint"), true)
        }?.optJSONArray("paragraphs")?.let { selection.put("paragraphs", it) }
        return selection.put("type", "preservation")
    }

    private fun clearParagraphPreservation() {
        saved.remove<String>("paragraphPreservation")
        paragraphInspection.value = null
    }

    fun clearDraft() {
        val old = state.value!!
        if (old.busy) return
        old.draft?.file?.delete()
        clearParagraphPreservation()
        publish(old.copy(draft = null, error = null, message = "ready"))
    }

    fun error(code: String) { publish(state.value!!.copy(error = code, message = null)) }

    fun importDraft(uri: Uri) {
        val old = state.value!!
        if (old.busy) return
        publish(old.copy(busy = true, error = null, message = "importing"))
        execute {
            var target: File? = null
            try {
                val resolver = context.contentResolver
                var name: String? = null
                var advertisedSize: Long? = null
                resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        name = cursor.getString(0)
                        if (!cursor.isNull(1)) advertisedSize = cursor.getLong(1)
                    }
                }
                val display = name ?: "draft"
                val ext = display.substringAfterLast('.', "").lowercase()
                if (ext !in listOf("docx", "txt", "md")) throw DocumentError("unsupported")
                if ((advertisedSize ?: 0L) > MAX_BYTES) throw DocumentError("too_large")
                val folder = File(context.cacheDir, "drafts").apply { mkdirs() }
                target = File(folder, "${UUID.randomUUID()}.$ext")
                var size = 0L
                resolver.openInputStream(uri)?.use { input ->
                    target.outputStream().use { output ->
                        val buffer = ByteArray(65536)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            size += count
                            if (size > MAX_BYTES) throw DocumentError("too_large")
                            output.write(buffer, 0, count)
                        }
                    }
                } ?: throw DocumentError("unreadable_file")
                if (size == 0L) throw DocumentError("empty_file")
                val draft = Draft(target, display.take(255), size)
                main.post {
                    old.draft?.file?.delete()
                    clearParagraphPreservation()
                    publish(old.copy(busy = false, draft = draft, error = null, message = "file_ready"))
                }
            } catch (error: Exception) {
                target?.delete()
                main.post { publish(old.copy(busy = false, error = (error as? DocumentError)?.code ?: "unreadable_file", message = null)) }
            }
        }
    }

    fun generate(request: JSONObject) {
        val old = state.value!!
        if (old.busy) return
        publish(old.copy(busy = true, error = null, message = "working"))
        execute {
            try {
                if (!Python.isStarted()) Python.start(AndroidPlatform(context))
                val directory = File(context.filesDir, "documents/${UUID.randomUUID()}")
                val response = Python.getInstance().getModule("android_bridge").callAttr(
                    "generate", request.toString(), old.draft?.file?.absolutePath ?: "", directory.absolutePath
                ).toString()
                val result = JSONObject(response)
                main.post {
                    if (result.optString("error") == "draft_changed") clearParagraphPreservation()
                    if (result.has("error")) publish(old.copy(busy = false, error = result.getString("error"), message = null))
                    else publish(old.copy(busy = false, result = result, error = null, message = "native_done"))
                }
            } catch (error: Exception) {
                android.util.Log.e("MLAFMT", "Offline formatter could not start", error)
                main.post { publish(old.copy(busy = false, error = "failed", message = null)) }
            }
        }
    }

    fun inspectParagraphs(requestId: Int) {
        val draft = state.value?.draft
        if (state.value?.busy == true) return
        if (draft == null) {
            paragraphInspection.value = JSONObject().put("type", "paragraphs")
                .put("request_id", requestId).put("error", "no_file")
            return
        }
        execute {
            val response = try {
                if (!Python.isStarted()) Python.start(AndroidPlatform(context))
                JSONObject(Python.getInstance().getModule("android_bridge")
                    .callAttr("paragraphs", draft.file.absolutePath).toString())
            } catch (_: Exception) { JSONObject().put("error", "bad_doc") }
            response.put("type", "paragraphs").put("request_id", requestId).put("file_id", draft.file.name)
            main.post {
                if (!disposed && state.value?.draft?.file?.name == draft.file.name)
                    paragraphInspection.value = response
            }
        }
    }

    fun resultFile(): File? = state.value?.result?.optString("path")?.let { path ->
        File(path).takeIf { validDocument(it) }
    }

    fun saveDocument(uri: Uri, file: File) {
        val old = state.value!!
        if (old.busy) return
        publish(old.copy(busy = true, error = null, message = "saving"))
        execute {
            try {
                context.contentResolver.openOutputStream(uri, "wt")?.use { output ->
                    file.inputStream().use { input -> input.copyTo(output) }
                } ?: throw DocumentError("save_failed")
                main.post { publish(old.copy(busy = false, error = null, message = "saved")) }
            } catch (_: Exception) {
                main.post { publish(old.copy(busy = false, error = "save_failed", message = null)) }
            }
        }
    }

    override fun onCleared() {
        disposed = true
        // Let any private-file write finish; no UI or Activity is retained.
        worker.shutdown()
        super.onCleared()
    }

    private class DocumentError(val code: String) : Exception()
    companion object { const val MAX_BYTES = 20L * 1024 * 1024 }
}
