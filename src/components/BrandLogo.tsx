import React from 'react';
import type { BrandConfig } from '../types/inspection';

interface BrandLogoProps {
  brand: BrandConfig;
  className?: string;
}

export const DefaultGearLogoSvg: React.FC<{ className?: string }> = ({ className = 'w-14 h-14' }) => (
  <svg viewBox="0 0 140 140" className={className} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <path id="tisTopArcReact" d="M 22,70 A 48,48 0 1,1 118,70" />
    </defs>
    <circle cx="70" cy="70" r="64" fill="#1e3a8a" stroke="#1e3a8a" strokeWidth="6" strokeDasharray="7 4.2" />
    <circle cx="70" cy="70" r="60" fill="#1e3a8a" />
    <circle cx="70" cy="70" r="55" fill="#dc2626" />
    <circle cx="70" cy="70" r="51" fill="#fefce8" />
    <path d="M 19,74 L 121,74 A 51,51 0 0,1 19,74 Z" fill="#1e3a8a" />
    <text fill="#1e3a8a" fontSize="10.2" fontWeight="800" fontFamily="Sarabun, sans-serif" letterSpacing="0.3">
      <textPath href="#tisTopArcReact" startOffset="50%" textAnchor="middle">
        TEAM INSPECTION SERVICES
      </textPath>
    </text>
    <circle cx="70" cy="64" r="24" fill="#ffffff" stroke="#1e3a8a" strokeWidth="2.5" />
    <polygon points="70,45 50,60 90,60" fill="#dc2626" />
    <rect x="55" y="60" width="30" height="20" fill="#1e3a8a" rx="1.5" />
    <rect x="65" y="67" width="10" height="13" fill="#fefce8" rx="1" />
    <rect x="58" y="63" width="5" height="5" fill="#93c5fd" rx="0.5" />
    <rect x="77" y="63" width="5" height="5" fill="#93c5fd" rx="0.5" />
    <text x="70" y="105" textAnchor="middle" fill="#ffffff" fontSize="7.5" fontWeight="700" letterSpacing="0.4">
      HOME INSPECTOR
    </text>
    <text x="70" y="116" textAnchor="middle" fill="#fde047" fontSize="7.5" fontWeight="800">
      • 2024 •
    </text>
  </svg>
);

export const BrandLogo: React.FC<BrandLogoProps> = ({ brand, className = 'w-14 h-14' }) => {
  if (brand.customLogoDataUrl) {
    return (
      <img
        src={brand.customLogoDataUrl}
        alt={brand.companyName}
        referrerPolicy="no-referrer"
        className={`${className} object-contain rounded-lg bg-white`}
      />
    );
  }
  return <DefaultGearLogoSvg className={className} />;
};
