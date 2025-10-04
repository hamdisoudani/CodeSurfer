import { useEffect, useRef, useState, useCallback } from 'react';

interface UseSmartAutoScrollOptions {
  messages: any[];
  threshold?: number; // How close to bottom to consider "at bottom" (in pixels)
}

interface UseSmartAutoScrollReturn {
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  hasNewMessages: boolean;
  scrollToBottom: () => void;
  markMessagesAsRead: () => void;
}

export function useSmartAutoScroll({ 
  messages, 
  threshold = 100 
}: UseSmartAutoScrollOptions): UseSmartAutoScrollReturn {
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [lastMessageCount, setLastMessageCount] = useState(0);
  const lastScrollPosition = useRef(0);

  // Check if user is at bottom of scroll area
  const checkIfAtBottom = useCallback(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return false;

    const { scrollTop, scrollHeight, clientHeight } = scrollArea;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= threshold;
  }, [threshold]);

  // Smooth scroll to bottom
  const scrollToBottom = useCallback(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    scrollArea.scrollTo({
      top: scrollArea.scrollHeight,
      behavior: 'smooth'
    });
    
    setHasNewMessages(false);
    setIsAtBottom(true);
  }, []);

  // Mark messages as read (hide new message indicator)
  const markMessagesAsRead = useCallback(() => {
    setHasNewMessages(false);
  }, []);

  // Handle scroll events to track position (throttled)
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      // Clear previous timeout to throttle scroll events
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }

      scrollTimeout = setTimeout(() => {
        const currentlyAtBottom = checkIfAtBottom();
        setIsAtBottom(currentlyAtBottom);

        // If user scrolled to bottom manually, mark messages as read
        if (currentlyAtBottom && hasNewMessages) {
          setHasNewMessages(false);
        }

        lastScrollPosition.current = scrollArea.scrollTop;
      }, 100); // Increased throttle to 100ms for better performance
    };

    scrollArea.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollArea.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    };
  }, [checkIfAtBottom, hasNewMessages]);

  // Handle new messages - smart auto-scroll logic
  useEffect(() => {
    const messageCount = messages.length;
    
    // If this is the first load, just scroll to bottom
    if (lastMessageCount === 0 && messageCount > 0) {
      setLastMessageCount(messageCount);
      setTimeout(scrollToBottom, 100); // Small delay to ensure DOM is ready
      return;
    }

    // If we have new messages
    if (messageCount > lastMessageCount && lastMessageCount > 0) {
      if (isAtBottom) {
        // User was at bottom, auto-scroll to new message
        setTimeout(scrollToBottom, 100);
      } else {
        // User was reading above, show new message indicator
        setHasNewMessages(true);
      }
    }

    setLastMessageCount(messageCount);
  }, [messages.length, isAtBottom, lastMessageCount, scrollToBottom]);

  return {
    scrollAreaRef,
    isAtBottom,
    hasNewMessages,
    scrollToBottom,
    markMessagesAsRead
  };
}
