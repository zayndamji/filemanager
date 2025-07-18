import React from 'react';
import { Text, Platform } from 'react-native';

// Fallback to vector icons on native platforms
let NativeIcon: any = null;
if (Platform.OS !== 'web') {
  try {
    NativeIcon = require('react-native-vector-icons/MaterialIcons').default;
  } catch (e) {
    // Fallback if vector icons not available
  }
}

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: any;
}

// Web-compatible icon component that uses Unicode symbols on web and vector icons on native
const WebCompatibleIcon: React.FC<IconProps> = ({ name, size = 24, color = '#000', style }) => {
  const getIconSymbol = (iconName: string) => {
    const icons: { [key: string]: string } = {
      // Loading and media icons
      'hourglass-empty': '⏳',
      'image': '🖼️',
      'photo-library': '📷',
      'photo': '📷',
      'video-library': '🎥',
      'music-note': '🎵',
      'audiotrack': '🎵',
      'play-arrow': '▶️',
      'pause': '⏸️',
      'stop': '⏹️',
      'description': '📄',
      'folder': '📁',
      'insert-drive-file': '📄',
      
      // Navigation and action icons
      'check': '✓',
      'close': '✕',
      'add': '+',
      'delete': '🗑️',
      'delete-forever': '🗑️',
      'edit': '✏️',
      'download': '⬇️',
      'upload': '⬆️',
      'cloud-upload': '⬆️',
      'share': '📤',
      'save': '💾',
      'storage': '💾',
      'refresh': '🔄',
      'search': '🔍',
      'settings': '⚙️',
      'home': '🏠',
      'menu': '☰',
      'logout': '🚪',
      'archive': '📦',
      'unarchive': '📂',
      'brightness-4': '🌙',
      'brightness-7': '☀️',
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
      'visibility': '👁️',
      'visibility-off': '🙈',
      'lock': '🔒',
      'lock-open': '🔓',
      'security': '🔒',
      'warning': '⚠️',
      'error': '❌',
      'info': 'ℹ️',
      'help': '❓',
      'star': '⭐',
      'favorite': '❤️',
      'label': '🏷️',
      'thumb-up': '👍',
      'thumb-down': '👎',
    };
    return icons[iconName] || '?';
  };

  // Use native vector icons on native platforms when available
  if (Platform.OS !== 'web' && NativeIcon) {
    return <NativeIcon name={name} size={size} color={color} style={style} />;
  }

  // Use Unicode symbols on web or as fallback
  return (
    <Text style={[{ fontSize: size, color, lineHeight: size }, style]}>
      {getIconSymbol(name)}
    </Text>
  );
};

export default WebCompatibleIcon;
