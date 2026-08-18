const express = require('express');
const path = require('path');
const fs = require('fs');
const prisma = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const { upload, UPLOADS_DIR } = require('../middleware/upload');

const router = express.Router();

router.use(['/tasks/:taskId/attachments', '/attachments'], requireAuth, resolveTeam);

// ─── POST /tasks/:taskId/attachments — Upload attachments to task ─────────────

router.post('/tasks/:taskId/attachments', (req, res, next) => {
  upload.array('files', 5)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds maximum allowed limit of 5MB.' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'You can upload at most 5 files at a time.' });
      }
      if (err.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'File upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { taskId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided for upload' });
    }

    // Verify task belongs to current team
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        teamId: req.teamId,
      },
    });

    if (!task) {
      // Clean up uploaded files if task doesn't exist
      for (const f of files) {
        try { fs.unlinkSync(f.path); } catch (_) {}
      }
      return res.status(404).json({ error: 'Task not found in this team' });
    }

    // Create database records
    const createdRecords = await prisma.$transaction(
      files.map((file) =>
        prisma.taskAttachment.create({
          data: {
            taskId: task.id,
            teamId: req.teamId,
            uploaderId: req.userId,
            fileName: file.originalname.slice(0, 255),
            fileSize: file.size,
            mimeType: file.mimetype,
            storagePath: file.filename,
          },
          include: {
            uploader: {
              select: { id: true, name: true, email: true },
            },
          },
        })
      )
    );

    // Create activity record
    try {
      await prisma.activity.create({
        data: {
          taskId: task.id,
          userId: req.userId,
          action: 'attachment_added',
          details: {
            count: files.length,
            fileNames: files.map((f) => f.originalname),
          },
        },
      });
    } catch (_) {}

    res.status(201).json({
      success: true,
      attachments: createdRecords,
    });
  } catch (error) {
    console.error('POST /tasks/:taskId/attachments error:', error);
    res.status(500).json({ error: 'Failed to save task attachments' });
  }
});

// ─── GET /tasks/:taskId/attachments — List attachments for task ───────────────

router.get('/tasks/:taskId/attachments', async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        teamId: req.teamId,
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found in this team' });
    }

    const attachments = await prisma.taskAttachment.findMany({
      where: {
        taskId,
        teamId: req.teamId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json({ attachments });
  } catch (error) {
    console.error('GET /tasks/:taskId/attachments error:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// ─── DELETE /tasks/:taskId/attachments/:attachmentId — Delete attachment ──────

router.delete('/tasks/:taskId/attachments/:attachmentId', async (req, res) => {
  try {
    const { taskId, attachmentId } = req.params;

    const attachment = await prisma.taskAttachment.findFirst({
      where: {
        id: attachmentId,
        taskId,
        teamId: req.teamId,
      },
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Check permissions: uploader OR team owner/admin
    const isUploader = attachment.uploaderId === req.userId;
    const isPrivileged = req.teamRole === 'owner' || req.teamRole === 'admin';

    if (!isUploader && !isPrivileged) {
      return res.status(403).json({ error: 'You do not have permission to delete this attachment' });
    }

    // Delete record from DB
    await prisma.taskAttachment.delete({
      where: { id: attachmentId },
    });

    // Delete file from disk
    const filePath = path.join(UPLOADS_DIR, attachment.storagePath);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    // Log activity
    try {
      await prisma.activity.create({
        data: {
          taskId,
          userId: req.userId,
          action: 'attachment_removed',
          details: {
            fileName: attachment.fileName,
          },
        },
      });
    } catch (_) {}

    res.json({
      success: true,
      message: 'Attachment deleted successfully',
    });
  } catch (error) {
    console.error('DELETE /tasks/:taskId/attachments/:attachmentId error:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// ─── GET /attachments/:attachmentId/download — Download file ──────────────────

router.get('/attachments/:attachmentId/download', async (req, res) => {
  try {
    const { attachmentId } = req.params;

    const attachment = await prisma.taskAttachment.findFirst({
      where: {
        id: attachmentId,
        teamId: req.teamId,
      },
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const filePath = path.join(UPLOADS_DIR, attachment.storagePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on storage server' });
    }

    res.download(filePath, attachment.fileName);
  } catch (error) {
    console.error('GET /attachments/:attachmentId/download error:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

// ─── GET /attachments/:attachmentId/preview — Inline preview (images/pdfs) ───

router.get('/attachments/:attachmentId/preview', async (req, res) => {
  try {
    const { attachmentId } = req.params;

    const attachment = await prisma.taskAttachment.findFirst({
      where: {
        id: attachmentId,
        teamId: req.teamId,
      },
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const filePath = path.join(UPLOADS_DIR, attachment.storagePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on storage server' });
    }

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${attachment.fileName}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('GET /attachments/:attachmentId/preview error:', error);
    res.status(500).json({ error: 'Failed to preview attachment' });
  }
});

module.exports = router;
