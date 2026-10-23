import { AuthModal } from '@/auth/components/AuthModal';
import { AppErrorBoundary } from '@/error-handler/components/AppErrorBoundary';
import { AppFullScreenErrorFallback } from '@/error-handler/components/AppFullScreenErrorFallback';
import { AppPageErrorFallback } from '@/error-handler/components/AppPageErrorFallback';
import { FileUploadProvider } from '@/file-upload/components/FileUploadProvider';
import { InformationBannerIsImpersonating } from '@/information-banner/components/impersonate/InformationBannerIsImpersonating';
import { KeyboardShortcutMenu } from '@/keyboard-shortcut-menu/components/KeyboardShortcutMenu';
import { LayoutCustomizationBar } from '@/layout-customization/components/LayoutCustomizationBar';
import { AppNavigationDrawer } from '@/navigation/components/AppNavigationDrawer';
import { PageDragDropProvider } from '@/navigation-menu-item/display/dnd/providers/PageDragDropProvider';
import { useIsSettingsPage } from '@/navigation/hooks/useIsSettingsPage';
import { OBJECT_SETTINGS_WIDTH } from '@/settings/data-model/constants/ObjectSettings';
import { SignInAppNavigationDrawerMock } from '@/sign-in-background-mock/components/SignInAppNavigationDrawerMock';
import { Suspense, lazy, useContext } from 'react';
import { W144TensionStrip } from '@/w144/W144EngineState';
import { W144TopBar } from '@/w144/W144TopBar';

const SignInBackgroundMockPage = lazy(() =>
  import('@/sign-in-background-mock/components/SignInBackgroundMockPage').then(
    (module) => ({ default: module.SignInBackgroundMockPage }),
  ),
);
import { useShowFullscreen } from '@/ui/layout/fullscreen/hooks/useShowFullscreen';
import { useShowAuthModal } from '@/ui/layout/hooks/useShowAuthModal';
import { NAVIGATION_DRAWER_CONSTRAINTS } from '@/ui/layout/resizable-panel/constants/NavigationDrawerConstraints';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { styled } from '@linaria/react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Outlet } from 'react-router-dom';
import { useScreenSize } from 'twenty-ui/utilities';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';
const StyledLayout = styled.div`
  background: ${themeCssVariables.background.noisy};
  display: flex;
  flex-direction: column;
  height: 100dvh;
  position: relative;
  scrollbar-color: ${themeCssVariables.border.color.medium} transparent;
  scrollbar-width: 4px;
  width: 100%;

  *::-webkit-scrollbar-thumb {
    border-radius: ${themeCssVariables.border.radius.sm};
  }
`;

const StyledPageContainerBase = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: row;
  min-height: 0;
`;
const StyledPageContainer = motion.create(StyledPageContainerBase);

const StyledNavigationDrawerWrapper = styled.div`
  flex-shrink: 0;
`;

const StyledMainContainer = styled.div`
  display: flex;
  flex: 0 1 100%;
  overflow: hidden;
`;

export const DefaultLayout = () => {
  const isMobile = useIsMobile();
  const isSettingsPage = useIsSettingsPage();
  const windowsWidth = useScreenSize().width;
  const showAuthModal = useShowAuthModal();
  const useShowFullScreen = useShowFullscreen();
  const { theme } = useContext(ThemeContext);

  return (
    <>
      <FileUploadProvider>
        <StyledLayout className="w144-layout">
          <AppErrorBoundary FallbackComponent={AppFullScreenErrorFallback}>
            <InformationBannerIsImpersonating />
            <LayoutCustomizationBar />
            {!showAuthModal && !useShowFullScreen && <W144TopBar />}
            <StyledPageContainer
              className="w144-pagerow"
              animate={{
                marginLeft:
                  isSettingsPage && !isMobile && !useShowFullScreen
                    ? (windowsWidth -
                        (OBJECT_SETTINGS_WIDTH +
                          NAVIGATION_DRAWER_CONSTRAINTS.default +
                          76)) /
                      2
                    : 0,
              }}
              transition={{
                duration: theme.animation.duration.normal,
              }}
            >
              <PageDragDropProvider>
                {!showAuthModal && <KeyboardShortcutMenu />}
                {showAuthModal ? (
                  <StyledNavigationDrawerWrapper>
                    <SignInAppNavigationDrawerMock />
                  </StyledNavigationDrawerWrapper>
                ) : useShowFullScreen ? null : (
                  <>
                    <StyledNavigationDrawerWrapper className="w144-navwrap">
                      <AppNavigationDrawer />
                    </StyledNavigationDrawerWrapper>
                    <div className="w144-navscrim" aria-hidden />
                  </>
                )}
                {showAuthModal ? (
                  <>
                    <StyledMainContainer>
                      <Suspense fallback={null}>
                        <SignInBackgroundMockPage />
                      </Suspense>
                    </StyledMainContainer>
                    <AnimatePresence mode="wait">
                      <LayoutGroup>
                        <AuthModal>
                          <Outlet />
                        </AuthModal>
                      </LayoutGroup>
                    </AnimatePresence>
                  </>
                ) : (
                  <StyledMainContainer className="w144-work">
                    {/* W144: the tensions strip sits above the page; the page
                        keeps the row it had, one level down */}
                    <div className="w144-workcol">
                      <W144TensionStrip />
                      <div className="w144-workpage">
                        <AppErrorBoundary
                          FallbackComponent={AppPageErrorFallback}
                        >
                          <Outlet />
                        </AppErrorBoundary>
                      </div>
                    </div>
                  </StyledMainContainer>
                )}
              </PageDragDropProvider>
            </StyledPageContainer>
            {/* W144: no mobile bottom bar. Under 900px the W144 panel is a
                drawer behind the menu button in the top bar (W144NavButton),
                one navigation on every size */}
          </AppErrorBoundary>
        </StyledLayout>
      </FileUploadProvider>
    </>
  );
};
