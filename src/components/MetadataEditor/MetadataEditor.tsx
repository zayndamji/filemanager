import React, { useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import WebCompatibleIcon from '../WebCompatibleIcon';
import { ThemeContext } from '../../theme';

export interface MetadataEditorProps {
  name?: string;
  folderPath: string;
  tags: string[];
  onNameChange?: (name: string) => void;
  onFolderPathChange: (folderPath: string) => void;
  onTagsChange: (tags: string[]) => void;
  editable?: boolean;
  style?: any;
}

const MetadataEditor: React.FC<MetadataEditorProps> = ({
  name,
  folderPath,
  tags,
  onNameChange,
  onFolderPathChange,
  onTagsChange,
  editable = true,
  style,
}) => {
  const [tagInput, setTagInput] = React.useState('');

  const { theme } = useContext(ThemeContext);
  return (
    <View style={[{ paddingHorizontal: 20 }, style]}>
      {onNameChange && (
        <View style={[styles.inputContainer, { backgroundColor: theme.surface, shadowColor: theme.shadow }] }>
          <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 4 }}>Name:</Text>
          <TextInput
            style={[styles.input, {
              backgroundColor: theme.inputBackground,
              color: theme.text,
              borderColor: theme.inputBorder,
            }]}
            value={name}
            onChangeText={onNameChange}
            editable={editable}
            placeholder="Name"
            placeholderTextColor={theme.textSecondary}
          />
        </View>
      )}
      <View style={[styles.inputContainer, { backgroundColor: theme.surface, shadowColor: theme.shadow }] }>
        <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 4 }}>Folder path:</Text>
        <TextInput
          style={[styles.input, {
            backgroundColor: theme.inputBackground,
            color: theme.text,
            borderColor: theme.inputBorder,
          }]}
          value={folderPath}
          onChangeText={text => {
            const filtered = text.replace(/[^A-Za-z0-9\/]/g, '');
            onFolderPathChange(filtered);
          }}
          placeholder="e.g. photos/2025"
          placeholderTextColor={theme.textSecondary}
          editable={editable}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2, marginBottom: 2, paddingLeft: 2 }}>
          Uploading to: /{folderPath.split('/').filter(Boolean).join('/')}
        </Text>
      </View>
      <View style={[styles.inputContainer, { backgroundColor: theme.surface, shadowColor: theme.shadow }] }>
        <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 4 }}>Tags:</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <WebCompatibleIcon name="label" size={20} color={theme.accentSecondary} />
          <TextInput
            style={[styles.input, { flex: 1, marginLeft: 8, backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.inputBorder }]} 
            value={tagInput}
            onChangeText={setTagInput}
            placeholder="Add a tag and press +"
            placeholderTextColor={theme.textSecondary}
            editable={editable}
            onSubmitEditing={() => {
              const newTag = tagInput.trim();
              if (newTag && !tags.includes(newTag)) {
                onTagsChange([...tags, newTag]);
                setTagInput('');
              }
            }}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={styles.addTagButton}
            onPress={() => {
              const newTag = tagInput.trim();
              if (newTag && !tags.includes(newTag)) {
                onTagsChange([...tags, newTag]);
                setTagInput('');
              }
            }}
            disabled={!editable || !tagInput.trim()}
          >
            <WebCompatibleIcon name="add" size={24} color={!editable || !tagInput.trim() ? theme.disabled : theme.accent} />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {tags.map((tag, idx) => (
            <View key={tag + idx} style={styles.tagChip}>
              <Text style={styles.tagChipText}>{tag}</Text>
              <TouchableOpacity
                onPress={() => onTagsChange(tags.filter((t, i) => i !== idx))}
                style={styles.removeTagButton}
                disabled={!editable}
              >
                <WebCompatibleIcon name="close" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  inputContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginTop: 20,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  input: {
    fontSize: 14,
    color: '#333',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 0,
  },
  addTagButton: {
    marginLeft: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 8,
  },
  tagChipText: {
    color: '#fff',
    fontSize: 13,
    marginRight: 4,
  },
  removeTagButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    padding: 2,
    marginLeft: 2,
  },
});

export default MetadataEditor;
