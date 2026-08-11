import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../api/config';

const RealtimeContext = createContext(null);

export function RealtimeProvider({ children }) {
  const [status, setStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  const [viewersByTask, setViewersByTask] = useState({});
  const [typingUsersByTask, setTypingUsersByTask] = useState({});
  const socketRef = useRef(null);
  const activeTasksRef = useRef(new Set());
  const currentTeamRef = useRef(null);
  const typingTimeoutsRef = useRef(new Map());

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setStatus('disconnected');
      return;
    }

    setStatus('connecting');

    const socket = io(API_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');

      // Re-join active team room if set
      if (currentTeamRef.current) {
        socket.emit('join:team', { teamId: currentTeamRef.current });
      }

      // Re-join active task rooms
      for (const taskId of activeTasksRef.current) {
        socket.emit('join:task', { taskId });
      }
    });

    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        setStatus('disconnected');
      } else {
        setStatus('reconnecting');
      }
    });

    socket.on('connect_error', () => {
      setStatus('reconnecting');
    });

    socket.on('reconnect', () => {
      setStatus('connected');
    });

    // Real-time active viewers updates
    socket.on('presence:viewers', ({ taskId, viewers }) => {
      if (!taskId) return;
      setViewersByTask((prev) => ({
        ...prev,
        [taskId]: viewers || [],
      }));
    });

    // Real-time typing indicators
    socket.on('typing:start', ({ taskId, user }) => {
      if (!taskId || !user) return;
      setTypingUsersByTask((prev) => {
        const currentList = prev[taskId] || [];
        if (currentList.some((u) => u.id === user.id)) return prev;
        return {
          ...prev,
          [taskId]: [...currentList, user],
        };
      });

      // Auto-clear typing indicator after 4 seconds of inactivity
      const timeoutKey = `${taskId}:${user.id}`;
      if (typingTimeoutsRef.current.has(timeoutKey)) {
        clearTimeout(typingTimeoutsRef.current.get(timeoutKey));
      }
      const timeout = setTimeout(() => {
        setTypingUsersByTask((prev) => {
          const currentList = prev[taskId] || [];
          return {
            ...prev,
            [taskId]: currentList.filter((u) => u.id !== user.id),
          };
        });
        typingTimeoutsRef.current.delete(timeoutKey);
      }, 4000);
      typingTimeoutsRef.current.set(timeoutKey, timeout);
    });

    socket.on('typing:stop', ({ taskId, userId }) => {
      if (!taskId || !userId) return;
      setTypingUsersByTask((prev) => {
        const currentList = prev[taskId] || [];
        return {
          ...prev,
          [taskId]: currentList.filter((u) => u.id !== userId),
        };
      });
      const timeoutKey = `${taskId}:${userId}`;
      if (typingTimeoutsRef.current.has(timeoutKey)) {
        clearTimeout(typingTimeoutsRef.current.get(timeoutKey));
        typingTimeoutsRef.current.delete(timeoutKey);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const joinTeam = useCallback((teamId) => {
    if (!teamId) return;
    currentTeamRef.current = teamId;
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('join:team', { teamId });
    }
  }, []);

  const leaveTeam = useCallback((teamId) => {
    if (!teamId) return;
    if (currentTeamRef.current === teamId) {
      currentTeamRef.current = null;
    }
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('leave:team', { teamId });
    }
  }, []);

  const joinTask = useCallback((taskId) => {
    if (!taskId) return;
    activeTasksRef.current.add(taskId);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('join:task', { taskId });
    }
  }, []);

  const leaveTask = useCallback((taskId) => {
    if (!taskId) return;
    activeTasksRef.current.delete(taskId);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('leave:task', { taskId });
    }
    setViewersByTask((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }, []);

  const startTyping = useCallback((taskId) => {
    if (!taskId) return;
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('typing:start', { taskId });
    }
  }, []);

  const stopTyping = useCallback((taskId) => {
    if (!taskId) return;
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('typing:stop', { taskId });
    }
  }, []);

  const subscribe = useCallback((event, handler) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler);
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.off(event, handler);
      }
    };
  }, []);

  const value = {
    socket: socketRef.current,
    status,
    isConnected: status === 'connected',
    joinTeam,
    leaveTeam,
    joinTask,
    leaveTask,
    startTyping,
    stopTyping,
    viewersByTask,
    typingUsersByTask,
    subscribe,
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}
