import React from 'react';
import { useLocation } from 'react-router';
import { isViewTransitionInFlight } from '../utils/pageTransition';

/**
 * Fades the incoming page in for route changes a View Transition can't cover:
 * browser back/forward, and browsers without the View Transitions API.
 * When a View Transition is already running the wrapper stays inert so the
 * page isn't animated twice.
 */
export const RouteTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  // Decided once per route change so later re-renders can't restart the animation.
  // Keyed on pathname (not location.key) so navigating to the route you're
  // already on doesn't remount the page and throw away its state.
  const animationClass = React.useMemo(
    () => (isViewTransitionInFlight() ? '' : 'origami-route-enter'),
    [location.pathname]
  );

  return (
    <div key={location.pathname} className={animationClass}>
      {children}
    </div>
  );
};
