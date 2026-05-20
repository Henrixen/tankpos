import React, { useState, useEffect } from "react";
import { C } from "./constants";
import { getCacheAge } from "./offlineCache";

function OfflineIndicator({ cacheKey = "positions" }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [cacheAge, setCacheAge] = useState(null);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      console.log("🟢 Back online");
    };
    
    const handleOffline = () => {
      setOnline(false);
      console.log("🔴 Offline mode");
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Update cache age every minute
    const interval = setInterval(() => {
      setCacheAge(getCacheAge(cacheKey));
    }, 60000);
    
    setCacheAge(getCacheAge(cacheKey));
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [cacheKey]);
  
  if (online && cacheAge === null) return null;
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      background: online ? 'rgba(79,195,247,0.15)' : 'rgba(245,158,11,0.9)',
      borderBottom: `1px solid ${online ? 'rgba(79,195,247,0.4)' : 'rgba(245,158,11,1)'}`,
      color: online ? C.blue : '#000',
      padding: '6px 12px',
      textAlign: 'center',
      fontSize: 11,
      fontWeight: 700,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8
    }}>
      <span>{online ? '📡' : '✈️'}</span>
      <span>
        {online 
          ? `ONLINE ${cacheAge !== null ? `• Last sync ${cacheAge}h ago` : ''}`
          : `OFFLINE MODE • Viewing cached data${cacheAge !== null ? ` (${cacheAge}h old)` : ''}`
        }
      </span>
    </div>
  );
}

export default OfflineIndicator;
