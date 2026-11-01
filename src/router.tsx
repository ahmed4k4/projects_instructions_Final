import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';

const Landing = lazy(() => import('@/pages/Landing'));
const Builder = lazy(() => import('@/pages/Builder'));
const AIAdvisor = lazy(() => import('@/pages/AIAdvisor'));
const PrebuiltConfigs = lazy(() => import('@/pages/PrebuiltConfigs'));
const Community = lazy(() => import('@/pages/Community'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const BuildDetail = lazy(() => import('@/pages/BuildDetail'));
const SmartBuilder = lazy(() => import('@/pages/SmartBuilder'));
const Auth = lazy(() => import('@/pages/Auth'));
const BuildDoctor = lazy(() => import('@/pages/BuildDoctor'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const fallback = <LoadingSkeleton variant="page" />;

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={fallback}>
            <Landing />
          </Suspense>
        ),
      },

      {
        path: 'builder',
        element: (
          <Suspense fallback={fallback}>
            <Builder />
          </Suspense>
        ),
      },
      {
        path: 'builder/ai',
        element: (
          <Suspense fallback={fallback}>
            <SmartBuilder />
          </Suspense>
        ),
      },
      {
        path: 'auth',
        element: (
          <Suspense fallback={fallback}>
            <Auth />
          </Suspense>
        ),
      },
      {
        path: 'dashboard/builds/:id/doctor',
        element: (
          <Suspense fallback={fallback}>
            <BuildDoctor />
          </Suspense>
        ),
      },
      {
        path: 'ai-advisor',
        element: (
          <Suspense fallback={fallback}>
            <AIAdvisor />
          </Suspense>
        ),
      },
      {
        path: 'prebuilt',
        element: (
          <Suspense fallback={fallback}>
            <PrebuiltConfigs />
          </Suspense>
        ),
      },
      {
        path: 'community',
        element: (
          <Suspense fallback={fallback}>
            <Community />
          </Suspense>
        ),
      },
      {
        path: 'dashboard',
        element: (
          <Suspense fallback={fallback}>
            <Dashboard />
          </Suspense>
        ),
      },
      {
        path: 'b/:slug',
        element: (
          <Suspense fallback={fallback}>
            <BuildDetail />
          </Suspense>
        ),
      },
      {
        path: '*',
        element: (
          <Suspense fallback={fallback}>
            <NotFound />
          </Suspense>
        ),
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
