import { useState, useEffect, useCallback } from 'react';
import { Clock, AlertCircle, Check, X, Zap, TrendingUp, Trash2, RotateCcw, Lock, Mail, LogIn, Loader2, CreditCard, ArrowLeft } from 'lucide-react';
import { Toaster, toast } from 'sonner';

// --- TYPES ---
type SeatState = 'available' | 'selected' | 'booked' | 'locked';
type SeatTier = 'vip' | 'premium' | 'standard';

interface Seat {
  id: string;
  row: string;
  number: number;
  state: SeatState;
  tier: SeatTier;
  price: number;
  lockedBy?: number;
  ttl?: number;
}

interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

const BOOKING_TIME_LIMIT = 300; // 5 Minutes

const TIER_CONFIG: Record<SeatTier, { price: number; color: string; glowColor: string; label: string }> = {
  vip: { price: 12000, color: 'border-yellow-500', glowColor: 'shadow-yellow-500/50', label: 'VIP' },
  premium: { price: 8000, color: 'border-purple-500', glowColor: 'shadow-purple-500/50', label: 'Premium' },
  standard: { price: 5000, color: 'border-blue-500', glowColor: 'shadow-blue-500/50', label: 'Standard' },
};

export default function App() {
  // --- AUTH STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  // APP STATES
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  
  // New State for Payment View
  const [isPaymentView, setIsPaymentView] = useState(false);
  const [orderId, setOrderId] = useState(''); // Store Order ID in state so it doesn't change on re-render
  
  const [timeLeft, setTimeLeft] = useState(BOOKING_TIME_LIMIT);
  const [liveUsers, setLiveUsers] = useState(1420);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logCounter, setLogCounter] = useState(0);
  const [isBooking, setIsBooking] = useState(false); // Loading state for API calls
  const [recentSoldCount, setRecentSoldCount] = useState(0);
  const [devMode, setDevMode] = useState(false);
  const [shakingSeat, setShakingSeat] = useState<string | null>(null);
  const [isSessionExpired, setIsSessionExpired] = useState(false); 
  const [myUserId, setMyUserId] = useState<string | number>(0); 

  // PERSISTENCE
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUserId = localStorage.getItem('userId');
    if (storedToken && storedUserId) {
        setToken(storedToken);
        setMyUserId(storedUserId);
        setIsAuthenticated(true);
    }
  }, []);

  const handleLogout = () => {
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      window.location.reload();
  };

  // LOGGING
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogCounter((prev) => {
      const newId = prev + 1;
      setLogs((prevLogs) => {
        const newLog: LogEntry = {
          id: newId,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          message,
          type,
        };
        return [newLog, ...prevLogs].slice(0, 100);
      });
      return newId;
    });
  }, []);

  // Auth Handles
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const allowedDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
    const domain = email.split('@')[1];
    if (!domain || !allowedDomains.includes(domain)) {
        return toast.error("Only Gmail, Yahoo, Outlook, or iCloud allowed.");
    }

    if (showOtpInput) {
        try {
            const res = await fetch('http://localhost:3001/api/auth/verify-register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp, password, phone })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('userId', data.userId);
                setToken(data.token);
                setMyUserId(data.userId);
                setIsAuthenticated(true);
                toast.success("Welcome!");
            } else {
                toast.error(data.error || "Failed");
            }
        } catch (err) { toast.error("Server Error"); }
    } else {
        setIsSendingOtp(true); 
        try {
            const res = await fetch('http://localhost:3001/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            if (data.success) {
                setShowOtpInput(true);
                toast.success("OTP Sent!");
            } else {
                toast.error(data.error);
            }
        } catch (err) { toast.error("Server Error"); }
        finally { setIsSendingOtp(false); } 
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        const res = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('userId', data.userId);
            setToken(data.token);
            setMyUserId(data.userId);
            setIsAuthenticated(true);
            toast.success("Logged In");
        } else {
            toast.error(data.error);
        }
    } catch (err) { toast.error("Server Error"); }
  };

  // APP LOGIC

  // Timer: Only runs when in Payment View
  useEffect(() => {
    if (!isAuthenticated || !isPaymentView) return;
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSessionExpired(); // Release seats if time runs out
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isAuthenticated, isPaymentView]);

  const handleSessionExpired = async () => {
    setIsSessionExpired(true);
    await releaseAllSeats();
    setIsPaymentView(false);
  };

  // Fetch Stadium Data
  useEffect(() => {
    if(!isAuthenticated) return;
    const fetchStadium = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/seats');
        const data = await res.json();
        if (data.seats) {
          setSeats((currentSeats) => {
             if (currentSeats.length === 0) return data.seats;
             return data.seats.map((serverSeat: Seat) => {
                const currentSeat = currentSeats.find(s => s.id === serverSeat.id);
                
                // Keep local selection ONLY if server says it's still available
                // If server says 'locked' (by someone else) or 'booked', our local selection is invalid
                if (currentSeat?.state === 'selected' && serverSeat.state === 'available') {
                    return { ...serverSeat, state: 'selected' }; // Visual selection only
                }
                
                if (isPaymentView && selectedSeats.includes(serverSeat.id)) {
                     
                     if(serverSeat.state === 'locked' && String(serverSeat.lockedBy) === String(myUserId)) {
                         return serverSeat; 
                     }
                }

                return serverSeat;
             });
          });
          const sold = data.seats.filter((s: Seat) => s.state === 'booked').length;
          setRecentSoldCount(sold);
        }
      } catch (err) {}
    };
    fetchStadium();
    const interval = setInterval(fetchStadium, 1000); 
    return () => clearInterval(interval);
  }, [myUserId, isAuthenticated, isPaymentView, selectedSeats]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 1. Selection is local-only
  const handleSeatClick = async (seatId: string) => {
    const seat = seats.find((s) => s.id === seatId);
    
    // Cannot select if booked or locked by someone else
    if (!seat || seat.state === 'booked') {
        setShakingSeat(seatId); setTimeout(() => setShakingSeat(null), 500);
        return toast.error("Seat unavailable");
    }
    if (seat.state === 'locked' && String(seat.lockedBy) !== String(myUserId)) {
        setShakingSeat(seatId); setTimeout(() => setShakingSeat(null), 500);
        return toast.error(`Seat locked by user`);
    }

    if (selectedSeats.includes(seatId)) {
        // Deselect
        setSelectedSeats((prev) => prev.filter((id) => id !== seatId));
        setSeats((prev) => prev.map((s) => (s.id === seatId ? { ...s, state: 'available' } : s)));
    } else {
        // Select Locally
        setSelectedSeats((prev) => [...prev, seatId]);
        setSeats((prev) => prev.map((s) => (s.id === seatId ? { ...s, state: 'selected' } : s))); 
    }
  };

  const releaseAllSeats = async () => {
      await Promise.all(selectedSeats.map(seatId => 
        fetch('http://localhost:3001/api/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seatId, userId: myUserId })
        })
    ));
    setSelectedSeats([]);
  };

  const handleClearSelection = () => {
    setSelectedSeats([]);
    setSeats((prev) => prev.map((s) => selectedSeats.includes(s.id) ? { ...s, state: 'available' } : s));
  };

  // 2. Triggers Lock & Timer
  const handleProceedToPayment = async () => {
    if (selectedSeats.length === 0) return;
    setIsBooking(true);
    
    // Attempt to lock all selected seats
    const lockPromises = selectedSeats.map(seatId => 
        fetch('http://localhost:3001/api/lock', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ seatId }) 
        }).then(res => res.json().then(data => ({ seatId, success: res.ok && data.success })))
    );

    const results = await Promise.all(lockPromises);
    const failed = results.filter(r => !r.success);

    if (failed.length > 0) {
        // Release any that succeeded because we want all or nothing (simplification)
        const succeeded = results.filter(r => r.success);
        await Promise.all(succeeded.map(r => 
            fetch('http://localhost:3001/api/release', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seatId: r.seatId, userId: myUserId })
            })
        ));
        
        // Update UI
        toast.error(`${failed.length} seat(s) are no longer available. Please re-select.`);
        // Refresh audience data immediately
        setSeats(prev => prev.map(s => {
            if (failed.find(f => f.seatId === s.id)) return { ...s, state: 'booked' }; // Assume booked
            if (selectedSeats.includes(s.id)) return { ...s, state: 'available' }; // Reset others
            return s;
        }));
        setSelectedSeats([]);
    } else {
        // All locked successfully
        setTimeLeft(BOOKING_TIME_LIMIT);
        
        // Generate Order ID here
        setOrderId(Math.floor(Math.random() * 900000 + 100000).toString());
        
        setIsPaymentView(true);
        addLog(`Locked ${selectedSeats.length} seats. Timer started.`, 'info');
        toast.success("Seats Reserved! Complete payment in 5 mins.");
    }
    setIsBooking(false);
  };

  const handleCancelPayment = async () => {
      setIsBooking(true);
      await releaseAllSeats();
      setIsPaymentView(false);
      setIsBooking(false);
      addLog("Payment cancelled. Locks released.", 'warning');
  };

  // 3. Final Payment
  const handleFinalPayment = async () => {
    setIsBooking(true);
    const idempotencyKey = `cart_${myUserId}_${selectedSeats.join('_')}_${Date.now()}`;

    try {
      // Pay for all seats
      const paymentPromises = selectedSeats.map(seatId => 
          fetch('http://localhost:3001/api/pay', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ idempotencyKey: `${idempotencyKey}_${seatId}`, seatId })
          }).then(res => res.json().then(data => ({ seatId, success: data.success, txId: data.txId })))
      );

      const results = await Promise.all(paymentPromises);
      const successful = results.filter(r => r.success);

      if (successful.length === selectedSeats.length) {
        setSeats((prev) => prev.map((s) => selectedSeats.includes(s.id) ? { ...s, state: 'booked' } : s));
        addLog(`✓ PAYMENT COMPLETE: Order Confirmed`, 'success');
        toast.success(`Booking Confirmed! Enjoy the show.`);
        setSelectedSeats([]);
        setIsPaymentView(false);
      } else {
        toast.error("Payment failed for some seats.");
      }
    } catch (error) { toast.error("Network Error"); } 
    finally { setIsBooking(false); }
  };

  const handleResetDB = async () => {
    if(!confirm("ARE YOU SURE?")) return;
    await fetch('http://localhost:3001/api/reset', { method: 'POST' });
    setSelectedSeats([]);
    window.location.reload();
  };

  const handleRefreshSession = () => window.location.reload();
  
  const calculateTotal = () => selectedSeats.reduce((sum, id) => sum + (seats.find(s => s.id === id)?.price || 0), 0);
  const totalPrice = calculateTotal();
  const tax = Math.floor(totalPrice * 0.05);
  const grandTotal = Math.floor(totalPrice * 1.05);

  const getSelectedSeatsByTier = () => {
    const breakdown: Record<SeatTier, string[]> = { vip: [], premium: [], standard: [] };
    selectedSeats.forEach((seatId) => {
      const seat = seats.find((s) => s.id === seatId);
      if (seat) breakdown[seat.tier].push(seatId);
    });
    return breakdown;
  };
  const seatBreakdown = getSelectedSeatsByTier();


  // --- RENDER ---
  if (!isAuthenticated) {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
            <Toaster position="top-center" theme="dark" />
            <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]"></div>
            
            <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 p-8 rounded-3xl w-full max-w-md shadow-2xl relative z-10">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-black bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Login to TicketS ID</h1>
                    <p className="text-gray-400 text-xs mt-1">The Secure Event Platform</p>
                </div>

                <div className="flex bg-black/40 p-1 rounded-xl mb-6">
                    <button onClick={() => setAuthMode('login')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${authMode === 'login' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>LOGIN</button>
                    <button onClick={() => setAuthMode('register')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${authMode === 'register' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>REGISTER</button>
                </div>

                {authMode === 'login' ? (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                            <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 text-white outline-none focus:border-blue-500" />
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                            <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 text-white outline-none focus:border-blue-500" />
                        </div>
                        <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all flex justify-center gap-2"><LogIn className="w-5 h-5"/> Access</button>
                    </form>
                ) : (
                    <form onSubmit={handleRegister} className="space-y-4">
                        {!showOtpInput ? (
                            <>
                                <input type="email" placeholder="Email (Gmail/Yahoo/Outlook)" value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white outline-none focus:border-purple-500" required />
                                <input type="text" placeholder="Phone" value={phone} onChange={e=>setPhone(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white outline-none focus:border-purple-500" required />
                                <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white outline-none focus:border-purple-500" required />
                                <button disabled={isSendingOtp} className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2">
                                    {isSendingOtp ? <><Loader2 className="w-5 h-5 animate-spin" /> Sending...</> : "Send OTP"}
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-center text-white text-sm">Check email for OTP</p>
                                <input type="text" maxLength={6} placeholder="000000" value={otp} onChange={e=>setOtp(e.target.value)} className="w-full bg-black/50 border border-purple-500/50 rounded-xl py-3 text-center text-white text-xl tracking-widest outline-none font-mono" required />
                                <button className="w-full bg-white text-black font-bold py-3 rounded-xl hover:scale-105 transition-all">Verify & Enter</button>
                            </>
                        )}
                    </form>
                )}
            </div>
        </div>
    );
  }

  // Main UI
  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6 overflow-hidden relative">
      <Toaster position="top-center" theme="dark" richColors />
      
      {isSessionExpired && (
        <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-red-500/50 rounded-2xl p-8 max-w-md w-full text-center">
                <h2 className="text-3xl font-bold text-white mb-2">Session Expired</h2>
                <button onClick={handleRefreshSession} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-xl mt-4">
                    <RotateCcw className="w-5 h-5 inline mr-2" /> Join Queue Again
                </button>
            </div>
        </div>
      )}

      {/* Header */}
      <div className="max-w-[1800px] mx-auto mb-6">
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-4 md:p-6 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-white via-blue-200 to-purple-300 bg-clip-text text-transparent mb-2">
                FOSSILS LIVE
              </h1>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span>Eden Gardens, Kolkata • March 15, 2026</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 md:gap-4">
              <div className="backdrop-blur-xl bg-white/5 border border-red-500/30 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg shadow-red-500/20">
                <div className="relative">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  <div className="absolute inset-0 w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">Live Users</div>
                  <div className="text-xl md:text-2xl font-bold text-red-500 font-mono">
                    {liveUsers.toLocaleString()}
                  </div>
                </div>
              </div>
              
              {/* Timer only shows in Payment View now */}
              {isPaymentView && (
                <div className="backdrop-blur-xl bg-white/5 border border-yellow-500/30 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg shadow-yellow-500/20">
                    <Clock className="w-6 h-6 text-yellow-500 animate-pulse" />
                    <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">Completing Payment</div>
                    <div className="text-xl md:text-2xl font-bold font-mono text-yellow-500">
                        {formatTime(timeLeft)}
                    </div>
                    </div>
                </div>
              )}

              <button onClick={handleLogout} className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 p-3 rounded-xl transition-all" title="Logout">
                  <RotateCcw className="w-5 h-5 text-red-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area - Swaps between Map and Payment */}
      {!isPaymentView ? (
        <div className="max-w-[1800px] mx-auto grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-4 md:p-8 shadow-2xl">
                <div className="flex justify-end mb-4">
                    <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full border border-white/10">
                        <span className="text-xs font-mono text-gray-400">DEV MODE</span>
                        <input type="checkbox" checked={devMode} onChange={(e) => setDevMode(e.target.checked)} className="accent-green-500 w-4 h-4 cursor-pointer" />
                    </div>
                </div>

                <div className="mb-8">
                <div className="relative bg-gradient-to-b from-purple-600/30 to-pink-600/30 border border-purple-500/50 rounded-xl py-4 text-center overflow-hidden shadow-lg shadow-purple-500/30">
                    <span className="relative text-2xl font-bold tracking-widest bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                    STAGE
                    </span>
                </div>
                </div>
                
                <div className="relative mb-6">
                <div className="grid grid-cols-10 gap-1">
                    {seats.map((seat) => {
                    const tierConfig = TIER_CONFIG[seat.tier];
                    const isMyLock = seat.state === 'selected';
                    const isAvailable = seat.state === 'available';
                    const isBooked = seat.state === 'booked'; 
                    // Server lock is effectively "booked" for other users in this view
                    const isServerLocked = seat.state === 'locked' && String(seat.lockedBy) !== String(myUserId);
                    const isSelected = selectedSeats.includes(seat.id);
                    const isShaking = shakingSeat === seat.id;
                    const isDisabled = isBooked || isServerLocked;

                    return (
                    <button key={seat.id} onClick={() => handleSeatClick(seat.id)} disabled={isDisabled} 
                        className={`h-7 md:h-9 rounded-md transition-all duration-200 text-xs font-mono relative flex items-center justify-center
                        ${isShaking ? 'animate-shake border-red-500 border-2' : ''}
                        ${(isAvailable && !isSelected) ? `bg-white/5 border-2 ${tierConfig.color} hover:bg-gradient-to-br hover:shadow-lg ${tierConfig.glowColor} hover:scale-110` : ''}
                        ${isSelected ? 'bg-gradient-to-br from-cyan-500 to-blue-600 border-2 border-cyan-400 scale-105 shadow-lg shadow-cyan-500/50 z-10' : ''}
                        ${isDisabled ? 'bg-red-950/40 border border-red-900/50 opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        {!isSelected && !isDisabled && !devMode && (
                            <span className={`font-bold text-[10px] ${seat.tier === 'vip' ? 'text-yellow-500' : 'text-gray-400'}`}>{seat.id}</span>
                        )}
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                        {isDisabled && !devMode && <X className="w-3 h-3 text-red-500" />}
                        {devMode && (
                            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-20 pointer-events-none rounded-md">
                                <span className="text-[8px] text-green-400 leading-none mb-0.5">{seat.id}</span>
                                {seat.ttl ? <span className="text-[7px] text-yellow-400 leading-none">TTL:{seat.ttl}</span> : <span className="text-[7px] text-gray-600 leading-none">--</span>}
                            </div>
                        )}
                    </button>
                    );
                })}
                </div>
                </div>
            </div>
            </div>

            <div className="xl:col-span-1">
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl sticky top-6">
                <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Order Summary</h2>
                {recentSoldCount > 0 && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2 animate-pulse">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                    <div className="font-bold text-red-500">High Demand Alert!</div>
                    <div className="text-red-300">{recentSoldCount} seat(s) just sold out</div>
                    </div>
                </div>
                )}
                
                <div className="mb-6">
                <div className="text-sm text-gray-400 mb-3 uppercase tracking-wider">Selected Seats</div>
                {selectedSeats.length === 0 ? (
                    <div className="text-gray-500 italic text-center py-8 border border-dashed border-gray-700 rounded-lg">No seats selected</div>
                ) : (
                    <div className="space-y-3">
                    {Object.entries(seatBreakdown).map(([tier, seatIds]) => {
                        if (seatIds.length === 0) return null;
                        const tierConfig = TIER_CONFIG[tier as SeatTier];
                        return (
                        <div key={tier} className="bg-white/5 border border-white/10 rounded-lg p-3">
                            <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-semibold uppercase text-gray-300">{tierConfig.label}</span>
                            <span className="text-sm font-mono text-gray-400">{seatIds.length}x ₹{tierConfig.price.toLocaleString()}</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                            {seatIds.map((seatId) => (
                                <span key={seatId} className={`px-2 py-1 rounded-md text-xs font-mono font-bold border-2 ${tierConfig.color} bg-white/5`}>{seatId}</span>
                            ))}
                            </div>
                        </div>
                        );
                    })}
                    </div>
                )}
                </div>
                
                <div className="border-t border-white/20 pt-4 mb-6">
                <div className="flex justify-between items-center text-sm mb-2">
                    <span className="text-gray-400">Subtotal</span>
                    <span className="font-mono text-gray-300">₹ {totalPrice.toLocaleString()}</span>
                </div>
                </div>
                
                <button onClick={handleProceedToPayment} disabled={selectedSeats.length === 0 || isBooking}
                className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-gray-700 disabled:to-gray-800 disabled:cursor-not-allowed py-4 px-6 rounded-xl font-bold text-lg mb-3 transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105 flex items-center justify-center gap-2">
                {isBooking ? <><Loader2 className="w-5 h-5 animate-spin"/> Locking...</> : <><Lock className="w-5 h-5" /> Secure Checkout</>}
                </button>
                
                <button onClick={handleClearSelection} disabled={selectedSeats.length === 0}
                className="w-full backdrop-blur-xl bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:cursor-not-allowed border border-white/20 py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2">
                <X className="w-4 h-4" /> Clear Selection
                </button>

                <button onClick={handleResetDB} className="mt-6 w-full group relative overflow-hidden bg-red-950/30 border border-red-500/30 hover:bg-red-900/50 text-red-400 hover:text-red-200 py-3 px-4 rounded-xl font-mono text-xs uppercase tracking-widest transition-all">
                    <div className="flex items-center justify-center gap-2"><Trash2 className="w-3 h-3 group-hover:animate-bounce" /><span>Admin: Wipe Database</span></div>
                </button>
            </div>
            </div>
        </div>
      ) : (
        // --- PAYMENT PAGE ---
        <div className="max-w-2xl mx-auto">
            <button onClick={handleCancelPayment} className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Cancel Transaction
            </button>
            
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gray-800">
                    <div className="h-full bg-yellow-500 transition-all duration-1000 ease-linear" style={{ width: `${(timeLeft / BOOKING_TIME_LIMIT) * 100}%` }}></div>
                </div>

                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h2 className="text-3xl font-bold bg-gradient-to-r from-yellow-200 to-amber-500 bg-clip-text text-transparent mb-2">Complete Payment</h2>
                        <p className="text-gray-400">Order ID: #{orderId}</p>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-500 uppercase font-mono mb-1">Expires In</div>
                        <div className="text-2xl font-mono text-yellow-500 font-bold">{formatTime(timeLeft)}</div>
                    </div>
                </div>

                <div className="bg-black/30 rounded-xl p-6 border border-white/5 mb-8">
                    <div className="space-y-4">
                        {selectedSeats.map(seatId => (
                            <div key={seatId} className="flex justify-between items-center border-b border-white/10 pb-4 last:border-0 last:pb-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded bg-blue-500/20 border border-blue-500/50 flex items-center justify-center font-mono text-xs text-blue-300">
                                        {seatId}
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-white">{seats.find(s=>s.id === seatId)?.tier.toUpperCase()} Seat</div>
                                        <div className="text-xs text-gray-500">Row {seatId.charAt(0)}</div>
                                    </div>
                                </div>
                                <div className="font-mono text-gray-300">₹ {seats.find(s=>s.id === seatId)?.price.toLocaleString()}</div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 pt-4 border-t border-white/20 space-y-2">
                        <div className="flex justify-between text-sm text-gray-400">
                            <span>Subtotal</span>
                            <span>₹ {totalPrice.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-400">
                            <span>Platform Fee (5%)</span>
                            <span>₹ {tax.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-xl font-bold text-white pt-2">
                            <span>Total Amount</span>
                            <span>₹ {grandTotal.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <button onClick={handleFinalPayment} disabled={isBooking}
                        className="w-full bg-gradient-to-r from-green-600 via-emerald-600 to-green-600 hover:from-green-500 hover:to-emerald-500 py-4 rounded-xl font-bold text-lg shadow-lg shadow-green-500/30 hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
                        {isBooking ? "Processing..." : <><CreditCard className="w-5 h-5" /> Pay ₹{grandTotal.toLocaleString()}</>}
                    </button>
                    <div className="flex items-center justify-center gap-2 text-xs text-gray-500 mt-2">
                        <Lock className="w-3 h-3" />
                        <span>Payment processed securely. Seats reserved for 5:00.</span>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Logs Area (Always visible) */}
      <div className="max-w-[1800px] mx-auto mt-6">
        <div className="backdrop-blur-xl bg-black/80 border-2 border-green-500/50 rounded-2xl overflow-hidden shadow-2xl shadow-green-500/20">
          <div className="bg-gray-900 px-4 py-2 border-b border-green-500/30 flex justify-between">
            <span className="text-green-500 font-mono text-sm">SYSTEM LOGS</span>
          </div>
          <div className="p-4 h-48 overflow-y-auto font-mono text-xs space-y-1">
             {logs.map(log => (
                 <div key={log.id} className={log.type === 'error' ? 'text-red-400' : 'text-green-400'}>
                     <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
                 </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
}