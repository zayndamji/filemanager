import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface PDFFileProps {
  fileData: Uint8Array;
  mimeType: string;
  // fileName prop should only appear once
  // name of pdf file
  fileName?: string; // optional name of pdf file
}

const PDFFile: React.FC<PDFFileProps> = ({ fileData, mimeType, fileName = 'document.pdf' }) => {
  return (
    <View style={styles.container}>
      {/* PDF file rendering */}
      <View style={styles.pdfContainer}>
        <View style={styles.pdfIcon}>
          <Icon name="picture-as-pdf" size={80} color="#FF5722" />
        </View>
        
        <Text style={styles.title}>{fileName}</Text>
        <Text style={styles.subtitle}>Type: {mimeType}</Text>
        <Text style={styles.subtitle}>Size: {(fileData.length / 1024).toFixed(1)} KB</Text>
        
        <View style={styles.infoContainer}>
        <Text style={styles.title}>{fileName || 'document.pdf'}</Text>
          <Text style={styles.noteText}>
            pdf viewing requires an external library
          </Text>
        </View>
        
        <TouchableOpacity style={styles.downloadButton}>
          <Icon name="download" size={24} color="#FFF" />
          <Text style={styles.downloadText}>Export PDF</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  pdfContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minWidth: 250,
    maxWidth: 350,
  },
  // styles for pdf file renderer
  pdfIcon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  // styles for pdf file renderer
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  infoContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 16,
    color: '#FF5722',
    fontWeight: '600',
    marginBottom: 8,
  },
  noteText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginBottom: 16,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF5722',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  downloadText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PDFFile;
