import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Paperclip,
  UploadCloud,
  FileText,
  FileArchive,
  Image as ImageIcon,
  Download,
  Trash2,
  Eye,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { API_URL } from '../api/config';
import { compressImage, formatBytes } from '../utils/imageCompressor';
import ImagePreviewModal from './ImagePreviewModal';

const API = API_URL;

export default function TaskAttachments({ taskId, teamId, canEdit = true }) {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(null);
  const [error, setError] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const token = localStorage.getItem('token');
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Team-Id': teamId,
  };

  useEffect(() => {
    if (taskId && teamId) {
      fetchAttachments();
    }
  }, [taskId, teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAttachments = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API}/tasks/${taskId}/attachments`, { headers });
      setAttachments(res.data.attachments || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load attachments');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessAndUpload = async (rawFiles) => {
    if (!rawFiles || rawFiles.length === 0) return;
    const fileList = Array.from(rawFiles).slice(0, 5);

    setUploading(true);
    setError('');
    setCompressionProgress({
      total: fileList.length,
      current: 0,
      originalTotalBytes: 0,
      compressedTotalBytes: 0,
    });

    try {
      const processedFiles = [];
      let totalOrig = 0;
      let totalComp = 0;

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        totalOrig += file.size;

        setCompressionProgress((prev) => ({
          ...prev,
          current: i + 1,
          fileName: file.name,
        }));

        const { file: compressedFile, compressedSize } = await compressImage(file, {
          maxWidth: 1920,
          maxHeight: 1080,
          quality: 0.8,
        });

        totalComp += compressedSize;
        processedFiles.push(compressedFile);
      }

      setCompressionProgress({
        total: fileList.length,
        current: fileList.length,
        originalTotalBytes: totalOrig,
        compressedTotalBytes: totalComp,
        savedPercent: totalOrig > totalComp ? Math.round(((totalOrig - totalComp) / totalOrig) * 100) : 0,
      });

      // Prepare Multipart Upload
      const formData = new FormData();
      processedFiles.forEach((file) => {
        formData.append('files', file);
      });

      const res = await axios.post(`${API}/tasks/${taskId}/attachments`, formData, {
        headers: {
          ...headers,
          'Content-Type': 'multipart/form-data',
        },
      });

      if (res.data.attachments) {
        setAttachments((prev) => [...res.data.attachments, ...prev]);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload attachments');
    } finally {
      setUploading(false);
      setTimeout(() => setCompressionProgress(null), 2500);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (attachmentId) => {
    if (!window.confirm('Are you sure you want to delete this attachment?')) return;
    try {
      await axios.delete(`${API}/tasks/${taskId}/attachments/${attachmentId}`, { headers });
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete attachment');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (canEdit) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!canEdit || uploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleProcessAndUpload(e.dataTransfer.files);
    }
  };

  const getFileIcon = (mimeType) => {
    if (mimeType.startsWith('image/')) return <ImageIcon size={18} color="#6366f1" />;
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return <FileArchive size={18} color="#f59e0b" />;
    return <FileText size={18} color="#3b82f6" />;
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Paperclip size={15} color="var(--color-canvas-mute, #888)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-canvas-ink, #171717)' }}>
            Attachments & Assets ({attachments.length})
          </span>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#0070f3',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <UploadCloud size={14} />
            Add Files
          </button>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => handleProcessAndUpload(e.target.files)}
        style={{ display: 'none' }}
        accept="image/*,.pdf,.txt,.csv,.json,.zip,.doc,.docx"
      />

      {/* Drag & Drop Upload Zone */}
      {canEdit && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          style={{
            border: isDragOver ? '2px dashed #0070f3' : '1px dashed var(--color-canvas-hairline, #ebebeb)',
            background: isDragOver ? 'rgba(0, 112, 243, 0.04)' : 'var(--color-canvas-soft, #fafafa)',
            borderRadius: 8,
            padding: '16px 20px',
            textAlign: 'center',
            cursor: uploading ? 'wait' : 'pointer',
            marginBottom: 16,
            transition: 'border-color 150ms, background-color 150ms',
          }}
        >
          {uploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Loader2 size={20} className="animate-spin" color="#0070f3" />
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-ink, #171717)' }}>
                {compressionProgress?.fileName
                  ? `Compressing ${compressionProgress.fileName} (${compressionProgress.current}/${compressionProgress.total})…`
                  : 'Uploading files…'}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <UploadCloud size={20} color="var(--color-canvas-mute, #888)" />
              <span style={{ fontSize: 12, color: 'var(--color-canvas-body, #50545c)' }}>
                <strong>Click to upload</strong> or drag and drop photos and documents
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-canvas-mute, #888)' }}>
                Images are automatically compressed to 1080p WebP (Max 5MB per file)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Compression Savings Banner */}
      {compressionProgress?.savedPercent > 0 && !uploading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            background: 'rgba(48, 164, 108, 0.1)',
            border: '1px solid rgba(48, 164, 108, 0.25)',
            borderRadius: 6,
            color: '#30a46c',
            fontSize: 12,
            marginBottom: 14,
          }}
        >
          <Sparkles size={14} />
          <span>
            Optimized upload: Saved {compressionProgress.savedPercent}% bandwidth ({formatBytes(compressionProgress.originalTotalBytes)} → {formatBytes(compressionProgress.compressedTotalBytes)})!
          </span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-banner" style={{ marginBottom: 14, fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Attachments List */}
      {loading ? (
        <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: 'var(--color-canvas-mute, #888)' }}>
          Loading attachments…
        </div>
      ) : attachments.length === 0 ? (
        <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--color-canvas-mute, #888)' }}>
          No files attached to this task.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {attachments.map((att) => {
            const isImage = att.mimeType.startsWith('image/');
            const previewUrl = `${API}/attachments/${att.id}/preview`;
            const downloadUrl = `${API}/attachments/${att.id}/download`;

            return (
              <div
                key={att.id}
                style={{
                  background: 'var(--color-canvas-card, #fff)',
                  border: '1px solid var(--color-canvas-card-border, #ebebeb)',
                  borderRadius: 8,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Thumbnail Preview for Images */}
                {isImage ? (
                  <div
                    onClick={() => setPreviewImage({ url: previewUrl, name: att.fileName, downloadUrl })}
                    style={{
                      height: 110,
                      width: '100%',
                      background: 'var(--color-canvas-soft, #f4f4f5)',
                      borderRadius: 6,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}
                  >
                    <img
                      src={previewUrl}
                      alt={att.fileName}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(0,0,0,0.3)',
                        opacity: 0,
                        transition: 'opacity 120ms',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 12,
                        gap: 4,
                      }}
                      className="hover-overlay"
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
                    >
                      <Eye size={14} /> Preview
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      height: 60,
                      width: '100%',
                      background: 'var(--color-canvas-soft, #f4f4f5)',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {getFileIcon(att.mimeType)}
                  </div>
                )}

                {/* File Details */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ minWidth: 0, flex: 1, paddingRight: 6 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'var(--color-canvas-ink, #171717)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={att.fileName}
                    >
                      {att.fileName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-canvas-mute, #888)' }}>
                      {formatBytes(att.fileSize)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <a
                      href={downloadUrl}
                      download={att.fileName}
                      title="Download"
                      style={{
                        padding: 4,
                        color: 'var(--color-canvas-mute, #888)',
                        borderRadius: 4,
                        display: 'inline-flex',
                      }}
                    >
                      <Download size={14} />
                    </a>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleDelete(att.id)}
                        title="Delete"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 4,
                          color: '#e5484d',
                          cursor: 'pointer',
                          borderRadius: 4,
                          display: 'inline-flex',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox / Preview Modal */}
      {previewImage && (
        <ImagePreviewModal
          isOpen={Boolean(previewImage)}
          onClose={() => setPreviewImage(null)}
          imageUrl={previewImage.url}
          fileName={previewImage.name}
          downloadUrl={previewImage.downloadUrl}
        />
      )}
    </div>
  );
}
