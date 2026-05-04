/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Settings, Play, FastForward, RotateCcw, TrendingUp, History, User, Building2 } from 'lucide-react';
import { motion } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

// True odds numerators / 36
const TRUE_ODDS: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6,
  8: 5, 9: 4, 10: 3, 11: 2, 12: 1
};

// Initial state constraints
const INITIAL_PLAYER_POT = 1000;
const INITIAL_HOUSE_POT = 100000;

interface BetHistory {
  id: string;
  round: number;
  betSum: number;
  betAmount: number;
  dice1: number;
  dice2: number;
  resultSum: number;
  win: boolean;
  payoutAmount: number; // The profit they made (if won)
}

interface SumStat {
  betsPlaced: number;
  totalBetAmount: number;
  totalPaidOut: number; // what house paid to player
  houseProfit: number; // totalBetAmount - totalPaidOut
}

interface ChartPoint {
  round: number;
  playerProfit: number;
  houseProfit: number;
}

const DEFAULT_PAYOUTS: Record<number, number> = {
  2: 20, 3: 10, 4: 8, 5: 5, 6: 3, 7: 2,
  8: 3, 9: 5, 10: 8, 11: 10, 12: 20
};

const INITIAL_STATS: Record<number, SumStat> = Object.keys(TRUE_ODDS).reduce((acc, sumStr) => {
  acc[parseInt(sumStr)] = { betsPlaced: 0, totalBetAmount: 0, totalPaidOut: 0, houseProfit: 0 };
  return acc;
}, {} as Record<number, SumStat>);

export default function App() {
  const [playerPot, setPlayerPot] = useState(INITIAL_PLAYER_POT);
  const [housePot, setHousePot] = useState(INITIAL_HOUSE_POT);
  const [payouts, setPayouts] = useState<Record<number, number>>(DEFAULT_PAYOUTS);
  
  const [currentBetAmount, setCurrentBetAmount] = useState<number>(10);
  const [selectedSum, setSelectedSum] = useState<number>(7);
  const [simSteps, setSimSteps] = useState<number>(100);

  const [history, setHistory] = useState<BetHistory[]>([]);
  const [stats, setStats] = useState<Record<number, SumStat>>(INITIAL_STATS);
  const [roundCounter, setRoundCounter] = useState(0);

  const [chartData, setChartData] = useState<ChartPoint[]>([{ round: 0, playerProfit: 0, houseProfit: 0 }]);

  const [dice, setDice] = useState<[number, number]>([1, 1]);
  const [isRolling, setIsRolling] = useState(false);

  const executeRound = (betSum: number, betAmount: number, currentPot: number, currentHouse: number) => {
    // Bet strictly the defined amount (allow negative balances to analyze long term math)
    const actualBet = betAmount;
    if (actualBet <= 0) return null;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const resultSum = d1 + d2;
    const win = (betSum === resultSum);

    let payoutAmt = 0;
    let houseProfitDelta = actualBet;
    
    if (win) {
      payoutAmt = actualBet * (payouts[betSum] || 0);
      houseProfitDelta = -payoutAmt; 
    }

    const nextPot = currentPot - actualBet + (win ? actualBet + payoutAmt : 0);
    const nextHouse = currentHouse + houseProfitDelta; // House keeps actualBet if loss, loses payoutAmt if win

    return {
      d1, d2, resultSum, win, actualBet, payoutAmt, nextPot, nextHouse, houseProfitDelta
    };
  };

  const processRoll = (isManual: boolean = true) => {
    // allow unlimited negative simulation
    if (isManual) {
      setIsRolling(true);
    }
    
    setTimeout(() => {
      const res = executeRound(selectedSum, currentBetAmount, playerPot, housePot);
      if (!res) {
        setIsRolling(false);
        return;
      }

      setDice([res.d1, res.d2]);
      setPlayerPot(res.nextPot);
      setHousePot(res.nextHouse);
      
      const newRound = roundCounter + 1;
      setRoundCounter(newRound);

      const newHistoryItem: BetHistory = {
        id: Math.random().toString(36).substr(2, 9),
        round: newRound,
        betSum: selectedSum,
        betAmount: res.actualBet,
        dice1: res.d1,
        dice2: res.d2,
        resultSum: res.resultSum,
        win: res.win,
        payoutAmount: res.payoutAmt
      };

      setHistory(prev => [newHistoryItem, ...prev].slice(0, 100)); // KEEP LAST 100 in visual history

      setStats(prev => ({
        ...prev,
        [selectedSum]: {
          betsPlaced: prev[selectedSum].betsPlaced + 1,
          totalBetAmount: prev[selectedSum].totalBetAmount + res.actualBet,
          totalPaidOut: prev[selectedSum].totalPaidOut + res.payoutAmt,
          houseProfit: prev[selectedSum].houseProfit + res.houseProfitDelta
        }
      }));

      setChartData(prev => {
        const newChartData = [...prev, {
          round: newRound,
          playerProfit: res.nextPot - INITIAL_PLAYER_POT,
          houseProfit: res.nextHouse - INITIAL_HOUSE_POT
        }];
        // Keep chart data manageable for performance, limit to last ~1000 points visually or just downsample
        if (newChartData.length > 500) {
          return newChartData.filter((_, idx) => idx % 2 === 0 || idx === newChartData.length - 1);
        }
        return newChartData;
      });

      if (isManual) {
        setIsRolling(false);
      }
    }, isManual ? 400 : 0);
  };

  const runSimulation = () => {
    let pPot = playerPot;
    let hPot = housePot;
    
    let newStats = { ...stats };
    let newHistory: BetHistory[] = [];
    let addChartData: ChartPoint[] = [];
    
    let simulatedRounds = 0;
    
    for (let i = 0; i < simSteps; i++) {
      // Allow simulation to continue into the negative to show mathematical expected value over time
      
      const actualBet = currentBetAmount;
      if (actualBet <= 0) break;
      
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const resultSum = d1 + d2;
      
      const win = (selectedSum === resultSum);
      
      let payoutAmt = 0;
      let houseProfitDelta = actualBet;
      if (win) {
        payoutAmt = actualBet * (payouts[selectedSum] || 0);
        houseProfitDelta = -payoutAmt;
      }
      
      pPot = pPot - actualBet + (win ? actualBet + payoutAmt : 0);
      hPot = hPot + houseProfitDelta;
      
      simulatedRounds++;
      
      const historyItem: BetHistory = {
        id: Math.random().toString(36).substr(2, 9),
        round: roundCounter + simulatedRounds,
        betSum: selectedSum,
        betAmount: actualBet,
        dice1: d1,
        dice2: d2,
        resultSum,
        win,
        payoutAmount: payoutAmt
      };
      newHistory.unshift(historyItem);
      
      newStats[selectedSum] = {
        betsPlaced: newStats[selectedSum].betsPlaced + 1,
        totalBetAmount: newStats[selectedSum].totalBetAmount + actualBet,
        totalPaidOut: newStats[selectedSum].totalPaidOut + payoutAmt,
        houseProfit: newStats[selectedSum].houseProfit + houseProfitDelta
      };
      
      const shouldRecord = (i % Math.ceil(simSteps / 100) === 0) || i === simSteps - 1;
      if (shouldRecord) {
        addChartData.push({
          round: roundCounter + simulatedRounds,
          playerProfit: pPot - INITIAL_PLAYER_POT,
          houseProfit: hPot - INITIAL_HOUSE_POT
        });
      }
    }
    
    setPlayerPot(pPot);
    setHousePot(hPot);
    setStats(newStats);
    setRoundCounter(prev => prev + simulatedRounds);
    setChartData(prev => {
      let combined = [...prev, ...addChartData];
      if (combined.length > 500) {
        // Downsample to keep it around 200-500 points
        const factor = Math.ceil(combined.length / 250);
        combined = combined.filter((_, idx) => idx % factor === 0 || idx === combined.length - 1);
      }
      return combined;
    });
    setHistory(prev => [...newHistory, ...prev].slice(0, 100));
    
    if (newHistory.length > 0) {
      setDice([newHistory[0].dice1, newHistory[0].dice2]);
    }
  };

  const resetGame = () => {
    setPlayerPot(INITIAL_PLAYER_POT);
    setHousePot(INITIAL_HOUSE_POT);
    setHistory([]);
    setStats(INITIAL_STATS);
    setRoundCounter(0);
    setChartData([{ round: 0, playerProfit: 0, houseProfit: 0 }]);
    setDice([1, 1]);
  };

  const handlePayoutChange = (val: string, sumKey: number) => {
    const num = parseInt(val);
    if (!isNaN(num) && num >= 0) {
      setPayouts(prev => ({ ...prev, [sumKey]: num }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans w-full p-4 md:p-8 flex flex-col overflow-x-hidden">
      <div className="max-w-[1024px] mx-auto w-full flex flex-col gap-4 flex-grow">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between md:items-end gap-6 mb-8 mt-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800 uppercase flex items-center gap-2">
              <History className="w-6 h-6 text-indigo-600 hidden md:block" />
              Dice Sim <span className="font-light text-slate-400">v1.0</span>
            </h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Probability & Payout Analysis Tool</p>
          </div>
          <div className="flex flex-wrap gap-8 items-end">
            <div className="text-right flex flex-col items-end">
              <p className="text-[10px] uppercase font-semibold text-slate-400">Bettor Capital</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPlayerPot(prev => prev + 1000)}
                  title="Refill $1,000"
                  className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold uppercase tracking-wider border border-indigo-100 hover:bg-indigo-100 transition-colors"
                >
                  +$1k
                </button>
                <p className={`text-3xl font-light tracking-tighter ${playerPot > INITIAL_PLAYER_POT ? 'text-emerald-500' : 'text-indigo-600'}`}>${playerPot.toLocaleString()}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-semibold text-slate-400">House Reserve</p>
              <p className={`text-3xl font-light tracking-tighter ${housePot < INITIAL_HOUSE_POT ? 'text-red-500' : 'text-slate-800'}`}>${housePot.toLocaleString()}</p>
            </div>
            <button 
              onClick={resetGame}
              className="mb-1 text-slate-400 hover:text-slate-800 transition-colors"
              title="Reset"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow">
          {/* Sidebar: Controls & Betting */}
          <aside className="lg:col-span-4 flex flex-col gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h2 className="text-xs font-bold uppercase mb-4 text-slate-500">Active Bet</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Target Outcome (Sum)</label>
                  <div className="grid grid-cols-6 gap-1">
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                      <button
                        key={num}
                        onClick={() => setSelectedSum(num)}
                        className={`h-8 text-xs font-bold border rounded transition-colors ${selectedSum === num ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 hover:bg-indigo-50 text-slate-600'}`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Wager Amount ($)</label>
                  <input 
                    type="number" 
                    min="1"
                    value={currentBetAmount}
                    onChange={e => setCurrentBetAmount(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-50 border border-slate-200 rounded p-3 text-lg font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <button 
                  onClick={() => processRoll(true)}
                  disabled={isRolling}
                  className="w-full bg-slate-900 text-white font-bold py-4 rounded-lg uppercase text-sm tracking-widest hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRolling ? 'Rolling...' : 'Place Bet & Roll'}
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm h-64 flex flex-col">
              <h3 className="text-xs font-bold uppercase mb-4 text-slate-500 flex justify-between">
                <span>Profit / Loss Over Time</span>
              </h3>
              <div className="flex-1 w-full mt-2 -ml-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis 
                      dataKey="round" 
                      tick={{fill: '#64748B', fontSize: 10}}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{fill: '#64748B', fontSize: 10}}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `$${val}`}
                      width={60}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1E293B', color: '#F1F5F9', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ fontSize: '12px' }}
                      labelStyle={{ color: '#94A3B8', marginBottom: '4px' }}
                      formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                    <Line 
                      name="Bettor Profit" 
                      type="monotone" 
                      dataKey="playerProfit" 
                      stroke="#818CF8" // indigo-400
                      strokeWidth={2} 
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line 
                      name="House Profit" 
                      type="monotone" 
                      dataKey="houseProfit" 
                      stroke="#0F172A" // slate-900
                      strokeWidth={2} 
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
               <h3 className="text-xs font-bold uppercase mb-4 text-slate-500">Auto-Simulate</h3>
               <div className="flex gap-2">
                  <input 
                    type="number" 
                    min="1" max="10000"
                    value={simSteps}
                    onChange={e => setSimSteps(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-1/2 bg-slate-50 border border-slate-200 rounded p-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button 
                    onClick={runSimulation}
                    className="w-1/2 bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold py-2 rounded uppercase text-xs hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  >
                    Run {simSteps}
                  </button>
               </div>
            </div>
          </aside>

          {/* Main Body: Odds Table & Results */}
          <main className="lg:col-span-8 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900 rounded-xl p-6 text-white flex flex-col justify-center items-center relative overflow-hidden h-40 shadow-sm">
                <div className="absolute top-3 right-4 text-[10px] uppercase font-bold text-slate-500">Last Roll</div>
                <div className="flex gap-4">
                  <DiceFace value={dice[0]} isRolling={isRolling} />
                  <DiceFace value={dice[1]} isRolling={isRolling} />
                </div>
                {history.length > 0 && roundCounter > 0 && !isRolling && (
                  <p className={`mt-4 text-sm font-bold uppercase tracking-widest ${history[0].win ? 'text-emerald-400' : 'text-slate-400'}`}>
                    Outcome: {dice[0] + dice[1]} — {history[0].win ? 'WIN' : 'LOSS'}
                  </p>
                )}
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-center h-40 shadow-sm">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">Session Statistics</p>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-xs text-slate-500">Total Rounds</span>
                  <span className="text-xs font-bold">{roundCounter}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-xs text-slate-500">Win Rate</span>
                  <span className="text-xs font-bold">
                    {history.length > 0 ? ((history.filter(h => h.win).length / history.length) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-xs text-slate-500">Avg. Bet Size</span>
                  <span className="text-xs font-bold">
                    ${history.length > 0 ? (history.reduce((acc, h) => acc + h.betAmount, 0) / history.length).toFixed(2) : '0.00'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-xs text-slate-500">Net House Profit</span>
                  <span className={`text-xs font-bold ${housePot - INITIAL_HOUSE_POT > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    ${(housePot - INITIAL_HOUSE_POT).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl flex-grow shadow-sm overflow-x-auto min-h-[300px]">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-[10px] uppercase font-bold text-slate-400 tracking-wider">Outcome</th>
                    <th className="px-6 py-3 text-[10px] uppercase font-bold text-slate-400 tracking-wider">Prob (Odds)</th>
                    <th className="px-6 py-3 text-[10px] uppercase font-bold text-slate-400 tracking-wider">Payout</th>
                    <th className="px-6 py-3 text-[10px] uppercase font-bold text-slate-400 tracking-wider">House P&L</th>
                    <th className="px-6 py-3 text-[10px] uppercase font-bold text-slate-400 tracking-wider">Configure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((sum) => {
                    const st = stats[sum];
                    return (
                      <tr key={sum} className={`hover:bg-slate-50 ${selectedSum === sum ? 'bg-indigo-50/50' : ''}`}>
                        <td className={`px-6 py-3 text-sm font-medium ${selectedSum === sum ? 'text-indigo-700' : 'text-slate-700'}`}>
                          {sum}
                        </td>
                        <td className={`px-6 py-3 text-xs ${selectedSum === sum ? 'text-indigo-500' : 'text-slate-500'}`}>
                          {TRUE_ODDS[sum]}/36 ({((TRUE_ODDS[sum]/36)*100).toFixed(1)}%)
                        </td>
                        <td className={`px-6 py-3 text-xs font-bold ${selectedSum === sum ? 'text-indigo-700' : 'text-slate-700'}`}>
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              min="1"
                              value={payouts[sum] || 1}
                              onChange={(e) => handlePayoutChange(e.target.value, sum)}
                              className="w-12 bg-white text-right p-1 rounded border border-slate-200 text-xs font-mono focus:border-indigo-500 outline-none"
                            />
                            <span>: 1</span>
                          </div>
                        </td>
                        <td className={`px-6 py-3 text-xs font-mono ${st.houseProfit > 0 ? 'text-emerald-600' : st.houseProfit < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {st.houseProfit > 0 ? '+' : ''}{st.houseProfit > 0 || st.houseProfit < 0 ? '$' : ''}{Math.abs(st.houseProfit).toLocaleString()}
                        </td>
                        <td className="px-6 py-2">
                           <button 
                             onClick={() => setSelectedSum(sum)}
                             className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-indigo-600 transition-colors"
                           >
                             Select
                           </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <footer className="flex justify-between items-center text-[10px] text-slate-400 uppercase tracking-widest px-2 py-4 mt-auto">
              <span>Simulation Active: Session #{Math.floor(Math.random() * 900) + 100}</span>
              <div className="flex gap-4">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> RNG Verified</span>
                <span className="flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${housePot > 0 ? 'bg-slate-300' : 'bg-red-500'}`}></span> {housePot > 0 ? 'House Reserve Stable' : 'House Bust'}</span>
              </div>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}

// Sub-components

function DiceFace({ value, isRolling }: { value: number, isRolling: boolean }) {
  return (
    <motion.div 
      className="w-14 h-14 md:w-16 md:h-16 bg-white rounded-lg flex items-center justify-center text-slate-900 text-2xl md:text-3xl font-black shadow-lg"
      animate={{ 
        rotate: isRolling ? [0, -10, 10, -10, 0] : 0,
        scale: isRolling ? [1, 1.1, 1] : 1
      }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      {isRolling ? '?' : value}
    </motion.div>
  );
}


