/**
 * Utility functions for video element management and timing
 */

// Type definitions for web video elements
type VideoElement = any; // Using any to avoid React Native TypeScript issues

/**
 * Waits for a video element ref to become available with proper DOM readiness
 * @param videoRef - React ref to video element
 * @param maxWaitMs - Maximum time to wait in milliseconds (default: 5000)
 * @param checkIntervalMs - Check interval in milliseconds (default: 50)
 * @returns Promise that resolves with the video element or rejects on timeout
 */
/**
 * Alternative approach: Try to find video element using DOM query as fallback
 */
const findVideoElementDirectly = (): VideoElement | null => {
  try {
    const doc = (global as any).document || (global as any).window?.document;
    if (doc) {
      const videos = doc.querySelectorAll('video');
      console.log('[VideoUtils] Found', videos.length, 'video elements in DOM');
      
      if (videos.length > 0) {
        // Look for a video element that doesn't have a source yet (for HLS)
        // or has the controls attribute (our video)
        for (let i = videos.length - 1; i >= 0; i--) {
          const video = videos[i];
          const hasControls = video.hasAttribute('controls');
          const hasValidParent = video.parentElement; // Ensure it's attached to DOM
          
          console.log('[VideoUtils] Checking video element', i, ':', {
            hasControls,
            hasValidParent,
            src: video.src || 'none',
            tagName: video.tagName
          });
          
          if (hasControls && hasValidParent) {
            console.log('[VideoUtils] Using video element with controls from DOM');
            return video as VideoElement;
          }
        }
        
        // Fallback: return the last video element
        const video = videos[videos.length - 1];
        console.log('[VideoUtils] Using last video element from DOM as fallback');
        return video as VideoElement;
      }
    }
  } catch (error) {
    console.warn('[VideoUtils] Direct DOM query failed:', error);
  }
  return null;
};

export const waitForVideoElement = async (
  videoRef: React.RefObject<VideoElement>,
  maxWaitMs: number = 8000, // Increased timeout
  checkIntervalMs: number = 100 // Increased interval for less aggressive polling
): Promise<VideoElement> => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let checkCount = 0;
    
    // Give extra time for React to render the element
    setTimeout(() => {
      const checkElement = () => {
        checkCount++;
        const elapsed = Date.now() - startTime;
        const video = videoRef.current;
        
        // Only log every 10th check to reduce noise
        if (checkCount % 10 === 0 || video || elapsed >= maxWaitMs) {
          console.log(`[VideoUtils] Check #${checkCount} (${elapsed}ms):`, {
            videoRef: !!videoRef,
            videoCurrent: !!video,
            videoType: typeof video
          });
        }
        
        if (video) {
          console.log('[VideoUtils] Video element found via ref after', elapsed, 'ms and', checkCount, 'checks');
          resolve(video);
          return;
        }
        
        // Fallback: try direct DOM query after a few checks
        if (checkCount > 10) { // Earlier fallback
          const directVideo = findVideoElementDirectly();
          if (directVideo) {
            console.log('[VideoUtils] Video element found via DOM query after', elapsed, 'ms and', checkCount, 'checks');
            // Update the ref for future use
            videoRef.current = directVideo;
            resolve(directVideo);
            return;
          }
        }
        
        if (elapsed >= maxWaitMs) {
          console.error('🚨 [VideoUtils] Video element timeout after', elapsed, 'ms and', checkCount, 'checks');
          
          // Last ditch effort - try direct DOM query
          const directVideo = findVideoElementDirectly();
          if (directVideo) {
            console.log('[VideoUtils] Video element found via final DOM query!');
            videoRef.current = directVideo;
            resolve(directVideo);
            return;
          }
          
          console.error('🚨 [VideoUtils] Final state:', {
            videoRef: !!videoRef,
            videoCurrent: !!video,
            videoType: typeof video
          });
          reject(new Error(`Video element not ready after ${maxWaitMs}ms`));
          return;
        }
        
        setTimeout(checkElement, checkIntervalMs);
      };
      
      checkElement();
    }, 500); // Wait 500ms before starting to check
  });
};

/**
 * Waits for video element to be ready for media operations
 * @param video - HTML video element
 * @param maxWaitMs - Maximum time to wait in milliseconds (default: 3000)
 * @returns Promise that resolves when video is ready for media operations
 */
export const waitForVideoMediaReady = async (
  video: VideoElement,
  maxWaitMs: number = 3000
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkReadiness = () => {
      // Check if video element is ready for media operations
      // HTMLMediaElement.HAVE_METADATA = 1, NETWORK_IDLE = 0
      if ((video.readyState && video.readyState >= 1) || 
          (video.networkState !== undefined && video.networkState === 0)) {
        console.log('[VideoUtils] Video media ready:', {
          readyState: video.readyState || 'unknown',
          networkState: video.networkState || 'unknown'
        });
        resolve();
        return;
      }
      
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        console.warn('[VideoUtils] Video media readiness timeout, proceeding anyway');
        resolve(); // Don't fail, just proceed
        return;
      }
      
      setTimeout(checkReadiness, 100);
    };
    
    checkReadiness();
  });
};

/**
 * Safely executes a video operation with proper error handling and retries
 * @param operation - Function that performs the video operation
 * @param operationName - Name for logging purposes
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param retryDelayMs - Delay between retries in milliseconds (default: 500)
 * @returns Promise that resolves with operation result or rejects after max retries
 */
export const safeVideoOperation = async <T>(
  operation: () => Promise<T> | T,
  operationName: string,
  maxRetries: number = 3,
  retryDelayMs: number = 500
): Promise<T> => {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[VideoUtils] ${operationName} attempt ${attempt}/${maxRetries}`);
      const result = await operation();
      console.log(`[VideoUtils] ${operationName} succeeded on attempt ${attempt}`);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[VideoUtils] ${operationName} failed on attempt ${attempt}:`, lastError.message);
      
      if (attempt < maxRetries) {
        console.log(`[VideoUtils] Retrying ${operationName} in ${retryDelayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }
  }
  
  throw new Error(`${operationName} failed after ${maxRetries} attempts: ${lastError?.message}`);
};

/**
 * Creates a debounced version of a function
 * @param func - Function to debounce
 * @param waitMs - Wait time in milliseconds
 * @returns Debounced function
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  waitMs: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      func(...args);
    }, waitMs);
  };
};
