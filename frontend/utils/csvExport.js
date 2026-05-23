// utils/csvExport.js — convert rows → CSV and download (web) / surface a hint (native)
//
// downloadCSV(rows, columns, filename)
//   rows:     array of objects
//   columns:  array of { key, label } (controls order + headers)
//   filename: 'attendance-2026-01.csv'

import { Platform, Share } from 'react-native';

const escape = (v) => {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCSV = (rows, columns) => {
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = (rows || []).map((row) =>
    columns.map((c) => escape(row[c.key])).join(',')
  ).join('\n');
  return header + '\n' + body;
};

export const downloadCSV = async (rows, columns, filename = 'export.csv') => {
  const csv = toCSV(rows, columns);

  if (Platform.OS === 'web') {
    // Browser: trigger a real download
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true };
  }

  // Native: share the CSV as text. Users can pick "Save to Files".
  try {
    await Share.share({ message: csv, title: filename });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
