import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
} from 'react-native';
import { SortOption } from '../context/FileContext';
import WebCompatibleIcon from './WebCompatibleIcon';

const { width } = Dimensions.get('window');

interface SortDropdownProps {
  sortBy: SortOption;
  onSortChange: (sortBy: SortOption) => void;
  theme: typeof import('../theme').darkTheme;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'name', label: 'Sort by Name' },
  { value: 'lastModified', label: 'Sort by Last Modified' },
  { value: 'uuid', label: 'Sort by UUID' },
];

export default function SortDropdown({ sortBy, onSortChange, theme }: SortDropdownProps) {
  const [modalVisible, setModalVisible] = useState(false);
  
  const styles = getStyles(theme);
  const currentSortLabel = sortOptions.find(option => option.value === sortBy)?.label || 'Sort by Name';

  const handleOptionSelect = (option: SortOption) => {
    onSortChange(option);
    setModalVisible(false);
  };

  return (
    <View>
      <TouchableOpacity
        style={styles.dropdownButton}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.dropdownButtonText}>{currentSortLabel}</Text>
        <WebCompatibleIcon name="keyboard-arrow-down" size={16} color={theme.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            {sortOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionButton,
                  sortBy === option.value && styles.selectedOption
                ]}
                onPress={() => handleOptionSelect(option.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionText,
                    sortBy === option.value && styles.selectedOptionText
                  ]}
                >
                  {option.label}
                </Text>
                {sortBy === option.value && (
                  <WebCompatibleIcon name="check" size={16} color={theme.accent} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const getStyles = (theme: typeof import('../theme').darkTheme) => StyleSheet.create({
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.border,
    minWidth: 160,
  },
  dropdownButtonText: {
    color: theme.text,
    fontSize: 14,
    marginRight: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    minWidth: Math.min(width * 0.8, 280),
    maxWidth: width * 0.9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  optionText: {
    color: theme.text,
    fontSize: 16,
    flex: 1,
  },
  selectedOption: {
    backgroundColor: theme.accent + '20',
  },
  selectedOptionText: {
    color: theme.accent,
    fontWeight: '600',
  },
});
