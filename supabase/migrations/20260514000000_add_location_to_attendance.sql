-- Migration: Add geolocation columns to attendance table

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS latitude  FLOAT,
  ADD COLUMN IF NOT EXISTS longitude FLOAT,
  ADD COLUMN IF NOT EXISTS accuracy  FLOAT,
  ADD COLUMN IF NOT EXISTS check_in_method TEXT DEFAULT 'wifi';
