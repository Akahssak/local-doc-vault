import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthScreen } from '@/components/AuthScreen';
import { VaultApp } from '@/components/VaultApp';
import { Toaster } from '@/components/Toast';
import { SpinnerIcon } from '@/components/Icons';

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center">
      <SpinnerIcon className="h-6 w-6 text-brand-400" />
    </div>
  );
}

function Gate() {
  const { status } = useAuth();
  switch (status) {
    case 'loading':
      return <Splash />;
    case 'needs-setup':
      return <AuthScreen mode="setup" />;
    case 'locked':
      return <AuthScreen mode="login" />;
    case 'unlocked':
      return <VaultApp />;
  }
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Gate />
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  );
}
