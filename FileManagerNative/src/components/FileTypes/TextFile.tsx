// text file renderer component
import React, { useState, useEffect } from 'react';
import { Platform, View, Text, StyleSheet, ScrollView } from 'react-native';

interface TextFileProps {
  fileData: Uint8Array;
}

const TextFileNative: React.FC<TextFileProps> = ({ fileData }) => {
  const [content, setContent] = useState<string>('');
  useEffect(() => {
    if (fileData) {
      const textContent = new TextDecoder().decode(fileData);
      setContent(textContent);
    }
  }, [fileData]);
  // styles only used in native
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#fff',
      margin: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e0e0e0',
    },
    scrollView: {
      flex: 1,
      padding: 16,
    },
    content: {
      fontSize: 14,
      lineHeight: 20,
      fontFamily: 'Menlo', // monospace font
      color: '#333',
    },
  });
  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={true}>
        <Text style={styles.content}>{content}</Text>
      </ScrollView>
    </View>
  );
};

const TextFileWeb: React.FC<TextFileProps> = ({ fileData }) => {
  const [content, setContent] = useState<string>('');
  useEffect(() => {
    if (fileData) {
      const textContent = new TextDecoder().decode(fileData);
      setContent(textContent);
    }
  }, [fileData]);
  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0e0e0', margin: 10, padding: 16, fontFamily: 'Menlo, monospace', fontSize: 14, color: '#333', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
      <pre style={{ margin: 0 }}>{content}</pre>
    </div>
  );
};

const TextFile: React.FC<TextFileProps> = (props) => {
  if (Platform.OS === 'web') return <TextFileWeb {...props} />;
  return <TextFileNative {...props} />;
};

export default TextFile;
