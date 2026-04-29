import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { auth, loginWithGoogle, logout, testConnection, handleFirestoreError, db } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export function FirebaseTest() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<string>('Đang kiểm tra kết nối...');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    testConnection().then(works => {
      setStatus(works ? 'Kết nối Firebase thành công' : 'Lỗi kết nối Firebase');
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (e: any) {
      alert("Lỗi đăng nhập: " + e.message);
    }
  };

  const handleWrite = async () => {
    if (!user) return;
    try {
        await setDoc(doc(db, 'users', user.uid), {
            email: user.email,
            lastLogin: new Date().toISOString()
        });
        alert('Ghi dữ liệu thành công lên Firebase!');
    } catch (e: any) {
        alert('Ghi dữ liệu thất bại: ' + e.message);
    }
  };

  if(!isOpen) {
      return (
          <button 
            onClick={() => setIsOpen(true)}
            className="fixed bottom-4 right-4 bg-primary text-on-primary px-4 py-2 rounded-full shadow-lg z-50 text-sm font-bold"
          >
            Test Firebase
          </button>
      );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-surface-container text-on-surface p-6 rounded-2xl shadow-xl z-50 border border-outline/20 w-80">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold">Test Firebase</h3>
        <button onClick={() => setIsOpen(false)} className="text-on-surface-variant hover:text-on-surface">Đóng</button>
      </div>
      <p className="text-sm mb-4">Trạng thái: <strong className={status.includes('thành công') ? 'text-primary' : 'text-error'}>{status}</strong></p>
      
      {user ? (
        <div className="space-y-3">
          <p className="text-sm">Đã đăng nhập: {user.email}</p>
          <button onClick={handleWrite} className="w-full bg-secondary text-on-secondary py-2 rounded-lg text-sm font-bold active:scale-95 transition-all">
            Ghi dữ liệu (Test Write)
          </button>
          <button onClick={logout} className="w-full bg-error text-on-error py-2 rounded-lg text-sm font-bold active:scale-95 transition-all">
            Đăng xuất
          </button>
        </div>
      ) : (
        <button onClick={handleLogin} className="w-full bg-primary text-on-primary py-2 rounded-lg text-sm font-bold active:scale-95 transition-all">
          Đăng nhập với Google
        </button>
      )}
    </div>
  );
}
