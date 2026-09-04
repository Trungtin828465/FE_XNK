import { Outfit } from 'next/font/google';
import './globals.css';
import "flatpickr/dist/flatpickr.css";
import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { SystemNotificationProvider } from '@/context/SystemNotificationContext';
import { SystemConfirmProvider } from '@/context/SystemConfirmContext';

const outfit = Outfit({
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} dark:bg-gray-900`}>
        <ThemeProvider>
          <AuthProvider>
            <SystemNotificationProvider>
              <SystemConfirmProvider>
                <SidebarProvider>{children}</SidebarProvider>
              </SystemConfirmProvider>
            </SystemNotificationProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
