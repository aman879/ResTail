/**
 * Reads a File object and resolves with its text contents.
 * Used for parsing uploaded LaTeX files into plain text strings.
 */
export async function parseLatexFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (typeof content === 'string') {
        resolve(content);
      } else {
        reject(new Error('Failed to parse file as text.'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Error reading the file.'));
    };
    
    reader.readAsText(file);
  });
}
