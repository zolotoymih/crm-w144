import { Helmet } from 'react-helmet-async';

// W144: every product shows the W144 mark in the tab (the seven lights,
// public/w144-favicon.svg), not the workspace's own logo.
export const PageFavicon = () => {
  return (
    <Helmet>
      <link rel="icon" type="image/svg+xml" href="/w144-favicon.svg" />
    </Helmet>
  );
};
