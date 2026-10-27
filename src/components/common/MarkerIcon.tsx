/**
 * MarkerIcon Component
 * --------------------
 * Renders the appropriate Lucide icon for any built-in or user-customized
 * MarkerIconKey. Centralizing this mapping makes adding new icons trivial.
 */

import React from 'react';
import {
  Package,
  ScrollText,
  HelpCircle,
  AlertTriangle,
  Swords,
  Compass,
  Star,
  KeyRound,
  Skull,
  Flag,
  Eye,
  Flame,
} from 'lucide-react';
import { MarkerIconKey } from '../../types/models';

export const AVAILABLE_MARKER_ICONS: { key: MarkerIconKey; label: string }[] = [
  { key: 'chest', label: 'Chest / Item Box' },
  { key: 'tablet', label: 'Tablet / Scroll' },
  { key: 'mystery', label: 'Question / Mystery' },
  { key: 'trap', label: 'Warning / Hazard' },
  { key: 'boss', label: 'Swords / Boss' },
  { key: 'warp', label: 'Compass / Warp' },
  { key: 'star', label: 'Star / Poi' },
  { key: 'key', label: 'Key / Lock' },
  { key: 'skull', label: 'Skull / Danger' },
  { key: 'flag', label: 'Flag / Checkpoint' },
  { key: 'eye', label: 'Eye / Hidden' },
  { key: 'flame', label: 'Flame / Seal' },
];

interface MarkerIconProps {
  iconKey: MarkerIconKey;
  className?: string;
  size?: number;
}

export const MarkerIcon: React.FC<MarkerIconProps> = ({
  iconKey,
  className = '',
  size = 14,
}) => {
  switch (iconKey) {
    case 'chest':
      return <Package size={size} className={className} />;
    case 'tablet':
      return <ScrollText size={size} className={className} />;
    case 'mystery':
      return <HelpCircle size={size} className={className} />;
    case 'trap':
      return <AlertTriangle size={size} className={className} />;
    case 'boss':
      return <Swords size={size} className={className} />;
    case 'warp':
      return <Compass size={size} className={className} />;
    case 'star':
      return <Star size={size} className={className} />;
    case 'key':
      return <KeyRound size={size} className={className} />;
    case 'skull':
      return <Skull size={size} className={className} />;
    case 'flag':
      return <Flag size={size} className={className} />;
    case 'eye':
      return <Eye size={size} className={className} />;
    case 'flame':
      return <Flame size={size} className={className} />;
    default:
      return <HelpCircle size={size} className={className} />;
  }
};
