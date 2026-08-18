/**
 * Format bytes into human-readable strings (e.g. "240 KB", "1.2 MB")
 */
export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Compresses images client-side using HTML5 Canvas before uploading
 * Downscales images exceeding maxWidth/maxHeight and encodes to WebP/JPEG (quality: 0.8)
 * 
 * @param {File} file - Original file from input
 * @param {Object} options - Compression configuration
 * @returns {Promise<{ file: File, originalSize: number, compressedSize: number, savedPercent: number }>}
 */
export async function compressImage(file, options = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.8,
    preferredMimeType = 'image/webp',
  } = options;

  // If not a raster image or SVG/GIF, return untouched
  if (
    !file.type.startsWith('image/') ||
    file.type === 'image/svg+xml' ||
    file.type === 'image/gif'
  ) {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      savedPercent: 0,
    };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;

      img.onload = () => {
        let { width, height } = img;

        // Calculate proportional scale
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve({
            file,
            originalSize: file.size,
            compressedSize: file.size,
            savedPercent: 0,
          });
        }

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);

        // Determine best target mime type
        const outputMimeType = canvas.toDataURL('image/webp').startsWith('data:image/webp')
          ? preferredMimeType
          : 'image/jpeg';

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              // If compression somehow produced a larger file, keep original
              return resolve({
                file,
                originalSize: file.size,
                compressedSize: file.size,
                savedPercent: 0,
              });
            }

            const cleanName = file.name.replace(/\.[^/.]+$/, '');
            const ext = outputMimeType === 'image/webp' ? '.webp' : '.jpg';
            const compressedFile = new File([blob], `${cleanName}${ext}`, {
              type: outputMimeType,
              lastModified: Date.now(),
            });

            const savedPercent = Math.round(((file.size - blob.size) / file.size) * 100);

            resolve({
              file: compressedFile,
              originalSize: file.size,
              compressedSize: blob.size,
              savedPercent,
            });
          },
          outputMimeType,
          quality
        );
      };

      img.onerror = () => {
        resolve({
          file,
          originalSize: file.size,
          compressedSize: file.size,
          savedPercent: 0,
        });
      };
    };

    reader.onerror = () => {
      resolve({
        file,
        originalSize: file.size,
        compressedSize: file.size,
        savedPercent: 0,
      });
    };
  });
}
