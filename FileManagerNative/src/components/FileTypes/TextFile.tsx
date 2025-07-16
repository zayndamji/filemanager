// text file renderer component
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

// props for text file renderer
interface TextFileProps {
  fileData: Uint8Array; // text file data as bytes
}

// text file renderer
const TextFile: React.FC<TextFileProps> = ({ fileData }) => {
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    if (fileData) {
      // decode bytes to utf-8 string
      const textContent = new TextDecoder().decode(fileData);
      setContent(textContent);
    }
  }, [fileData]);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={true}>
        <Text style={styles.content}>{content}</Text>
      </ScrollView>
    </View>
  );
};

// styles for text file renderer
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

export default TextFile;
