package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

// allowedImageMIMEs maps MIME types to file extensions.
var allowedImageMIMEs = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

const maxAvatarSize = 5 << 20 // 5 MB
const maxCoverSize = 5 << 20  // 5 MB

// saveUpload parses a multipart upload, validates MIME, and saves to the uploads directory.
// Returns the public URL of the saved file. Writes JSON errors via w on failure.
func saveUpload(w http.ResponseWriter, a *App, r *http.Request, formField, subdir string, maxSize int64) (string, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxSize)
	if err := r.ParseMultipartForm(maxSize); err != nil {
		writeError(w, 400, "file_too_large", fmt.Sprintf("Файл слишком большой (максимум %d МБ).", maxSize>>20))
		return "", false
	}

	file, _, err := r.FormFile(formField)
	if err != nil {
		file, _, err = r.FormFile("file")
		if err != nil {
			writeError(w, 400, "file_missing", "Файл не найден в запросе. Используйте поле '"+formField+"' или 'file'.")
			return "", false
		}
	}
	defer file.Close()

	// MIME validation via content sniffing
	buf := make([]byte, 512)
	file.Read(buf)
	file.Seek(0, 0)
	mime := http.DetectContentType(buf)
	ext, ok := allowedImageMIMEs[mime]
	if !ok {
		writeError(w, 400, "invalid_file_type", "Допустимы только JPEG, PNG и WebP.")
		return "", false
	}

	// Save with server-generated filename
	outDir := filepath.Join(a.uploadsDir, subdir)
	os.MkdirAll(outDir, 0755)
	filename := safeFilename(ext)
	dstPath := filepath.Join(outDir, filename)
	dst, err := os.Create(dstPath)
	if err != nil {
		writeError(w, 500, "internal_error", "Ошибка сохранения файла.")
		return "", false
	}
	defer dst.Close()
	io.Copy(dst, file)

	url := "/uploads/" + subdir + "/" + filename
	return url, true
}
