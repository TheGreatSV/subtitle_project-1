import React from 'react';
import MobileApp from './Mobile';
import DesktopApp from './Desktop';

const App = () => {
  const isMobile = window.innerWidth <= 768; // You can adjust the breakpoint as needed

  return isMobile ? <MobileApp /> : <DesktopApp />;
};

export default App;