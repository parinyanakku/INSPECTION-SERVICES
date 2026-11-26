import React from 'react';

export const FloorPlanSvg: React.FC<{ floorIndex: number }> = ({ floorIndex }) => {
  if (floorIndex === 0) {
    return (
      <svg viewBox="0 0 800 600" className="w-full h-full pointer-events-none select-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid1React" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect width="800" height="600" fill="#f8fafc" />
        <rect width="800" height="600" fill="url(#grid1React)" />
        <rect x="40" y="28" width="720" height="544" fill="#ffffff" stroke="#334155" strokeWidth="6" rx="4" />
        <line x1="40" y1="145" x2="760" y2="145" stroke="#334155" strokeWidth="4" />
        <rect x="60" y="42" width="210" height="36" fill="#f1f5f9" stroke="#64748b" strokeWidth="1.5" />
        <rect x="115" y="48" width="54" height="24" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.2" rx="3" />
        <line x1="510" y1="145" x2="510" y2="415" stroke="#334155" strokeWidth="4" />
        <line x1="510" y1="270" x2="760" y2="270" stroke="#334155" strokeWidth="4" />
        <g stroke="#94a3b8" strokeWidth="1.5">
          <line x1="525" y1="162" x2="745" y2="162" />
          <line x1="525" y1="178" x2="745" y2="178" />
          <line x1="525" y1="194" x2="745" y2="194" />
          <line x1="525" y1="210" x2="745" y2="210" />
          <line x1="525" y1="226" x2="745" y2="226" />
          <line x1="525" y1="242" x2="745" y2="242" />
        </g>
        <ellipse cx="720" cy="315" rx="18" ry="12" fill="#f1f5f9" stroke="#64748b" strokeWidth="1.5" />
        <rect x="670" y="365" width="70" height="36" fill="#f1f5f9" stroke="#64748b" strokeWidth="1.5" rx="4" />
        <rect x="85" y="210" width="130" height="46" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" rx="6" />
        <rect x="110" y="275" width="80" height="36" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" rx="4" />
        <line x1="40" y1="415" x2="760" y2="415" stroke="#334155" strokeWidth="4" />
        <line x1="170" y1="415" x2="360" y2="415" stroke="#0284c7" strokeWidth="6" />
        <rect x="105" y="442" width="175" height="108" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 4" rx="10" />
        <rect x="330" y="442" width="175" height="108" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 4" rx="10" />
        <line x1="90" y1="572" x2="710" y2="572" stroke="#0f172a" strokeWidth="5" strokeDasharray="14 6" />
        <text x="400" y="592" textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="600">
          ▲ หน้าบ้าน / ประตูรั้วทางเข้า ▲
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 800 600" className="w-full h-full pointer-events-none select-none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid2React" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.7" />
        </pattern>
      </defs>
      <rect width="800" height="600" fill="#f8fafc" />
      <rect width="800" height="600" fill="url(#grid2React)" />
      <rect x="40" y="28" width="720" height="544" fill="#ffffff" stroke="#334155" strokeWidth="6" rx="4" />
      <line x1="40" y1="220" x2="760" y2="220" stroke="#334155" strokeWidth="4" />
      <line x1="510" y1="28" x2="510" y2="220" stroke="#334155" strokeWidth="4" />
      <rect x="90" y="55" width="130" height="110" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" rx="6" />
      <ellipse cx="710" cy="80" rx="18" ry="12" fill="#f1f5f9" stroke="#64748b" strokeWidth="1.5" />
      <rect x="650" y="155" width="90" height="45" fill="#f1f5f9" stroke="#64748b" strokeWidth="1.5" rx="4" />
      <line x1="40" y1="365" x2="760" y2="365" stroke="#334155" strokeWidth="4" />
      <line x1="510" y1="220" x2="510" y2="365" stroke="#334155" strokeWidth="4" />
      <g stroke="#94a3b8" strokeWidth="1.5">
        <line x1="525" y1="240" x2="745" y2="240" />
        <line x1="525" y1="260" x2="745" y2="260" />
        <line x1="525" y1="280" x2="745" y2="280" />
        <line x1="525" y1="300" x2="745" y2="300" />
        <line x1="525" y1="320" x2="745" y2="320" />
        <line x1="525" y1="340" x2="745" y2="340" />
      </g>
      <rect x="280" y="405" width="180" height="120" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" rx="6" />
      <rect x="295" y="415" width="60" height="26" fill="#e2e8f0" rx="4" />
      <rect x="385" y="415" width="60" height="26" fill="#e2e8f0" rx="4" />
      <line x1="160" y1="572" x2="640" y2="572" stroke="#0284c7" strokeWidth="6" />
      <text x="400" y="592" textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="600">
        ▲ ด้านหน้าบ้าน (ระเบียงห้องนอนใหญ่) ▲
      </text>
    </svg>
  );
};
