-- Migration: Add youtube_video_id column to shows table
-- Run this if you already have a database with shows data

ALTER TABLE shows ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;

