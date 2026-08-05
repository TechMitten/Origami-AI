import React from 'react';
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useResolvedPath,
  type LinkProps,
  type NavLinkProps,
  type NavigateOptions,
  type To,
} from 'react-router';
import { startPageTransition } from '../utils/pageTransition';

const isModifiedEvent = (event: React.MouseEvent<HTMLAnchorElement>) =>
  event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;

const opensOutsideCurrentTab = (target?: string) => Boolean(target) && target !== '_self';

/** Drop-in replacement for `useNavigate` that animates the route change. */
export const useTransitionNavigate = () => {
  const navigate = useNavigate();

  return React.useCallback(
    (to: To, options?: NavigateOptions) => {
      startPageTransition(() => navigate(to, options));
    },
    [navigate]
  );
};

type TransitionClickOptions = Pick<LinkProps, 'target' | 'replace' | 'state' | 'relative' | 'preventScrollReset'> & {
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

/**
 * Intercepts a plain left-click on an in-app link and performs the navigation
 * inside a View Transition. Anything else (new tab, modifier click, same route)
 * falls through to the router's own handling.
 */
const useTransitionClickHandler = (
  to: To,
  { target, replace, state, relative, preventScrollReset, onClick }: TransitionClickOptions
): React.MouseEventHandler<HTMLAnchorElement> => {
  const navigate = useTransitionNavigate();
  const location = useLocation();
  const resolvedPath = useResolvedPath(to, { relative });

  return (event) => {
    onClick?.(event);

    if (event.defaultPrevented) return;
    if (event.button !== 0 || isModifiedEvent(event) || opensOutsideCurrentTab(target)) return;
    if (resolvedPath.pathname === location.pathname) return;

    event.preventDefault();
    navigate(to, { replace, state, relative, preventScrollReset });
  };
};

export const TransitionLink: React.FC<LinkProps> = ({ to, onClick, ...rest }) => {
  const handleClick = useTransitionClickHandler(to, { ...rest, onClick });

  return <Link to={to} onClick={handleClick} {...rest} />;
};

export const TransitionNavLink: React.FC<NavLinkProps> = ({ to, onClick, ...rest }) => {
  const handleClick = useTransitionClickHandler(to, { ...rest, onClick });

  return <NavLink to={to} onClick={handleClick} {...rest} />;
};
