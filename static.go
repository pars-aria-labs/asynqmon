package asynqmon

import (
	"bytes"
	"errors"
	"html/template"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
)

// uiAssetsHandler is a http.Handler.
// The path to the static file directory and
// the path to the index file within that static directory are used to
// serve the SPA.
type uiAssetsHandler struct {
	rootPath       string
	contents       fs.FS
	staticDirPath  string
	indexFileName  string
	prometheusAddr string
	readOnly       bool
}

// ServeHTTP inspects the URL path to locate a file within the static dir
// on the SPA handler.
// If path '/' is requested, it will serve the index file, otherwise it will
// serve the file specified by the URL path.
func (h *uiAssetsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// URL and embed.FS paths always use forward slashes, even when the binary
	// runs on Windows. Cleaning from a synthetic root also prevents traversal.
	requestPath := path.Clean("/" + r.URL.Path)
	if h.rootPath != "" &&
		requestPath != h.rootPath &&
		!strings.HasPrefix(requestPath, h.rootPath+"/") {
		http.Error(w, "unexpected path prefix", http.StatusBadRequest)
		return
	}
	requestPath = strings.TrimPrefix(requestPath, h.rootPath)
	requestPath = strings.TrimPrefix(requestPath, "/")

	if code, err := h.serveFile(w, requestPath); err != nil {
		message := "invalid UI request"
		if code >= http.StatusInternalServerError {
			message = "failed to serve the UI"
		}
		http.Error(w, message, code)
		return
	}
}

func (h *uiAssetsHandler) indexFilePath() string {
	return path.Join(h.staticDirPath, h.indexFileName)
}

func (h *uiAssetsHandler) renderIndexFile(w http.ResponseWriter) error {
	// Keep Go's runtime placeholders distinct from delimiters used by frontend
	// tooling and JavaScript templates.
	tmpl, err := template.New(h.indexFileName).Delims("/[[", "]]").ParseFS(h.contents, h.indexFilePath())
	if err != nil {
		return err
	}
	prometheusConfigured := ""
	if _, err := parsePrometheusBaseURL(h.prometheusAddr); err == nil {
		prometheusConfigured = "true"
	}
	data := struct {
		RootPath             string
		PrometheusConfigured string
		ReadOnly             bool
	}{
		RootPath:             h.rootPath,
		PrometheusConfigured: prometheusConfigured,
		ReadOnly:             h.readOnly,
	}
	var rendered bytes.Buffer
	if err := tmpl.Execute(&rendered, data); err != nil {
		return err
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, err = w.Write(rendered.Bytes())
	return err
}

// serveFile writes file requested at path and returns http status code and error if any.
// If requested path is root, it serves the index file.
// Otherwise, it looks for file requiested in the static content filesystem
// and serves if a file is found.
// If a requested file is not found in the filesystem, it serves the index file to
// make sure when user refreshes the page in SPA things still work.
func (h *uiAssetsHandler) serveFile(w http.ResponseWriter, requestedPath string) (code int, err error) {
	if requestedPath == "/" || requestedPath == "" {
		if err := h.renderIndexFile(w); err != nil {
			return http.StatusInternalServerError, err
		}
		return http.StatusOK, nil
	}
	cleanPath := strings.TrimPrefix(path.Clean("/"+requestedPath), "/")
	assetPath := path.Join(h.staticDirPath, cleanPath)
	if !fs.ValidPath(assetPath) {
		return http.StatusBadRequest, errors.New("invalid asset path")
	}
	bytes, err := fs.ReadFile(h.contents, assetPath)
	if err != nil {
		// If path is error (e.g. file not exist, path is a directory), serve index file.
		var pathErr *fs.PathError
		if errors.As(err, &pathErr) {
			if err := h.renderIndexFile(w); err != nil {
				return http.StatusInternalServerError, err
			}
			return http.StatusOK, nil
		}
		return http.StatusInternalServerError, err
	}
	// Module scripts, stylesheets, and SVG assets need their extension's MIME
	// type; content sniffing alone does not reliably identify these formats.
	contentType := mime.TypeByExtension(path.Ext(assetPath))
	if strings.HasSuffix(assetPath, ".js") {
		contentType = "application/javascript; charset=utf-8"
	}
	if contentType == "" {
		contentType = http.DetectContentType(bytes)
	}
	w.Header().Set("Content-Type", contentType)

	if _, err := w.Write(bytes); err != nil {
		return http.StatusInternalServerError, err
	}
	return http.StatusOK, nil
}
