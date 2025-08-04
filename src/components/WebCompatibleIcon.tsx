import React from 'react';
import { Text } from 'react-native';

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: any;
}

// Universal icon component using Unicode symbols for all platforms
const WebCompatibleIcon: React.FC<IconProps> = ({ name, size = 24, color = '#000', style }) => {
  const getIconSymbol = (iconName: string) => {
    const icons: { [key: string]: string } = {
      // Loading and media icons
      'hourglass-empty': '⏳',
      'image': '🖼️',
      'photo-library': '🖼️',
      'photo': '🖼️',
      'collections': '🗂️',
      'video-library': '⬛',
      'music-note': '♪',
      'audiotrack': '♪',
      'play-arrow': '▶',
      'pause': '⏸',
      'stop': '⏹',
      'description': '�',
      'folder': '📁',
      'insert-drive-file': '📄',
      
      // Navigation and action icons
      'check': '✓',
      'close': '✕',
      'add': '+',
      'delete': '✕',
      'delete-forever': '✕',
      'edit': '✎',
      'download': '↓',
      'upload': '↑',
      'cloud-upload': '↑',
      'share': '⤴',
      'save': '⬇',
      'storage': '🖼️',
      'refresh': '↻',
      'search': '🔍',
      'settings': '⚙',
      'home': '⌂',
      'menu': '≡',
      'logout': '⤴',
      'archive': '📦',
      'unarchive': '📂',
      'brightness-4': '☽',
      'brightness-7': '☀',
      'more-vert': '⋮',
      'more-horiz': '⋯',
      'arrow-back': '←',
      'arrow-forward': '→',
      'keyboard-arrow-down': '▼',
      'keyboard-arrow-up': '▲',
      'keyboard-arrow-left': '◀',
      'keyboard-arrow-right': '▶',
      'chevron-right': '▶',
      'arrow-upward': '↑',
      'folder-open': '📂',
      
      // Status and UI icons
      'visibility': '👁',
      'visibility-off': '⊗',
      'lock': '🔒',
      'lock-open': '🔓',
      'security': '🔒',
      'warning': '⚠',
      'error': '✕',
      'info': 'ⓘ',
      'help': '?',
      'star': '★',
      'favorite': '♥',
      'label': '🏷',
      'thumb-up': '👍',
      'thumb-down': '👎',
    };
    return icons[iconName] || '?';
  };

  // Use Unicode symbols for all platforms (web and native)
  return (
    <Text style={[{ fontSize: size, color, lineHeight: size }, style]}>
      {getIconSymbol(name)}
    </Text>
  );
};

export default WebCompatibleIcon;
