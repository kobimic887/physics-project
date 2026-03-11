import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RotateCcw, Info, Trophy, Target, Zap, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import './App.css';

// Physics constants
const FRICTION = 0.98;
const FORCE_MULTIPLIER = 0.15;
const STOP_THRESHOLD = 0.1;

interface GameObject {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  color: string;
  reachedTarget: boolean;
  currentForce: number;
}

interface Target {
  id: number;
  x: number;
  y: number;
  radius: number;
}

interface Level {
  id: number;
  name: string;
  description: string;
  objects: GameObject[];
  targets: Target[];
  law: string;
}

const levels: Level[] = [
  {
    id: 1,
    name: "חוק ניוטון הראשון - אינרציה",
    description: "עצמים נשארים במנוחה אלא אם כן פועל עליהם כוח. הפעל כוח כדי להזיז את הכדור למטרה!",
    law: "חוק ראשון: עצם במנוחה נשאר במנוחה, ועצם בתנועה נשאר בתנועה אלא אם כן פועל עליו כוח חיצוני.",
    objects: [
      { id: 1, x: 100, y: 250, vx: 0, vy: 0, mass: 1, radius: 25, color: '#3b82f6', reachedTarget: false, currentForce: 0 },
    ],
    targets: [
      { id: 1, x: 600, y: 250, radius: 35 },
    ],
  },
  {
    id: 2,
    name: "חוק ניוטון השני - F=ma",
    description: "לעצמים כבדים יש צורך ביותר כוח כדי להאיץ. הכדור הכחול מסתו 1, הכדור האדום מסתו 3!",
    law: "חוק שני: כוח שווה למסה כפול תאוצה (F=ma). מסה גדולה יותר דורשת יותר כוח לאותה תאוצה.",
    objects: [
      { id: 1, x: 80, y: 150, vx: 0, vy: 0, mass: 1, radius: 20, color: '#3b82f6', reachedTarget: false, currentForce: 0 },
      { id: 2, x: 80, y: 350, vx: 0, vy: 0, mass: 3, radius: 30, color: '#ef4444', reachedTarget: false, currentForce: 0 },
    ],
    targets: [
      { id: 1, x: 600, y: 150, radius: 30 },
      { id: 2, x: 600, y: 350, radius: 40 },
    ],
  },
  {
    id: 3,
    name: "חוק ניוטון השלישי - פעולה ותגובה",
    description: "לכל פעולה יש תגובה שווה ונגדית. דחוף כדור אחד, השני זז גם הוא! צפה בטבלת הכוחות בצד.",
    law: "חוק שלישי: לכל פעולה יש תגובה שווה בגודלה ונגדית בכיוונה.",
    objects: [
      { id: 1, x: 200, y: 250, vx: 0, vy: 0, mass: 2, radius: 28, color: '#3b82f6', reachedTarget: false, currentForce: 0 },
      { id: 2, x: 400, y: 250, vx: 0, vy: 0, mass: 2, radius: 28, color: '#22c55e', reachedTarget: false, currentForce: 0 },
    ],
    targets: [
      { id: 1, x: 100, y: 250, radius: 35 },
      { id: 2, x: 500, y: 250, radius: 35 },
    ],
  },
];

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [objects, setObjects] = useState<GameObject[]>(levels[0].objects);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 });
  const [selectedObject, setSelectedObject] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [gameWon, setGameWon] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [forceData, setForceData] = useState<{ obj1Force: number; obj2Force: number; isColliding: boolean }>({
    obj1Force: 0,
    obj2Force: 0,
    isColliding: false,
  });
  const animationRef = useRef<number | null>(null);

  const adjustColor = (color: string, amount: number): string => {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  const resetLevel = useCallback(() => {
    const level = levels[currentLevel];
    setObjects(level.objects.map(obj => ({ ...obj, vx: 0, vy: 0, reachedTarget: false, currentForce: 0 })));
    setGameWon(false);
    setSelectedObject(null);
    setIsDragging(false);
    setForceData({ obj1Force: 0, obj2Force: 0, isColliding: false });
  }, [currentLevel]);

  useEffect(() => {
    resetLevel();
  }, [currentLevel, resetLevel]);

  // Physics update loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updatePhysics = () => {
      setObjects(prevObjects => {
        const newObjects = [...prevObjects];
        let collisionForce1 = 0;
        let collisionForce2 = 0;
        let isColliding = false;

        // Update positions and velocities
        for (let i = 0; i < newObjects.length; i++) {
          const obj = newObjects[i];
          if (obj.reachedTarget) continue;

          let newVx = obj.vx * FRICTION;
          let newVy = obj.vy * FRICTION;

          if (Math.abs(newVx) < STOP_THRESHOLD) newVx = 0;
          if (Math.abs(newVy) < STOP_THRESHOLD) newVy = 0;

          let newX = obj.x + newVx;
          let newY = obj.y + newVy;

          // Wall collisions
          if (newX - obj.radius < 0) {
            newX = obj.radius;
            newVx = -newVx * 0.7;
          }
          if (newX + obj.radius > canvas.width) {
            newX = canvas.width - obj.radius;
            newVx = -newVx * 0.7;
          }
          if (newY - obj.radius < 0) {
            newY = obj.radius;
            newVy = -newVy * 0.7;
          }
          if (newY + obj.radius > canvas.height) {
            newY = canvas.height - obj.radius;
            newVy = -newVy * 0.7;
          }

          // Check if reached target
          const level = levels[currentLevel];
          const targetIndex = obj.id - 1;
          if (targetIndex < level.targets.length) {
            const target = level.targets[targetIndex];
            const dx = newX - target.x;
            const dy = newY - target.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < target.radius) {
              newObjects[i] = { ...obj, x: target.x, y: target.y, vx: 0, vy: 0, reachedTarget: true, currentForce: 0 };
              continue;
            }
          }

          newObjects[i] = { ...obj, x: newX, y: newY, vx: newVx, vy: newVy };
        }

        // Check for object collisions (for level 3 - action/reaction)
        if (newObjects.length >= 2) {
          for (let i = 0; i < newObjects.length; i++) {
            for (let j = i + 1; j < newObjects.length; j++) {
              const obj1 = newObjects[i];
              const obj2 = newObjects[j];
              const dx = obj2.x - obj1.x;
              const dy = obj2.y - obj1.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              const minDistance = obj1.radius + obj2.radius;

              if (distance <= minDistance + 1 && distance > 0) {
                isColliding = true;

                // Calculate collision forces
                const nx = dx / distance;
                const ny = dy / distance;

                const v1n = obj1.vx * nx + obj1.vy * ny;
                const v2n = obj2.vx * nx + obj2.vy * ny;

                const m1 = obj1.mass;
                const m2 = obj2.mass;

                const newV1n = ((m1 - m2) * v1n + 2 * m2 * v2n) / (m1 + m2);
                const newV2n = ((m2 - m1) * v2n + 2 * m1 * v1n) / (m1 + m2);

                // Calculate force (change in momentum)
                // According to Newton's 3rd law: F1 = -F2, so |F1| = |F2|
                // Each ball experiences force based on its momentum change
                const deltaP1 = Math.abs((newV1n - v1n) * m1);
                const deltaP2 = Math.abs((newV2n - v2n) * m2);
                const force1 = deltaP1 * 10; // Scale for display
                const force2 = deltaP2 * 10; // Scale for display

                collisionForce1 = force1;
                collisionForce2 = force2;

                newObjects[i] = {
                  ...obj1,
                  vx: obj1.vx + (newV1n - v1n) * nx,
                  vy: obj1.vy + (newV1n - v1n) * ny,
                  currentForce: force1,
                };
                newObjects[j] = {
                  ...obj2,
                  vx: obj2.vx + (newV2n - v2n) * nx,
                  vy: obj2.vy + (newV2n - v2n) * ny,
                  currentForce: force2,
                };

                // Separate objects to prevent sticking
                const overlap = Math.max(0, minDistance - distance);
                const separationX = nx * overlap * 0.5;
                const separationY = ny * overlap * 0.5;
                newObjects[i] = { ...newObjects[i], x: obj1.x - separationX, y: obj1.y - separationY };
                newObjects[j] = { ...newObjects[j], x: obj2.x + separationX, y: obj2.y + separationY };
              }
            }
          }
        }

        setForceData(prev => {
          if (isColliding) {
            return { obj1Force: collisionForce1, obj2Force: collisionForce2, isColliding: true };
          }

          const decayedObj1 = prev.obj1Force * 0.92;
          const decayedObj2 = prev.obj2Force * 0.92;
          const hasForce = decayedObj1 > 0.05 || decayedObj2 > 0.05;

          return {
            obj1Force: hasForce ? decayedObj1 : 0,
            obj2Force: hasForce ? decayedObj2 : 0,
            isColliding: false,
          };
        });

        return newObjects;
      });

      animationRef.current = requestAnimationFrame(updatePhysics);
    };

    animationRef.current = requestAnimationFrame(updatePhysics);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [currentLevel]);

  // Check win condition
  useEffect(() => {
    const allReached = objects.every(obj => obj.reachedTarget);
    if (allReached && objects.length > 0 && !gameWon) {
      setGameWon(true);
      setScore(prev => prev + objects.length * 100);
    }
  }, [objects, gameWon]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }

    const level = levels[currentLevel];

    // Draw targets
    level.targets.forEach((target, index) => {
      const objectReached = objects[index]?.reachedTarget;
      ctx.beginPath();
      ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
      ctx.fillStyle = objectReached ? '#22c55e' : '#fef3c7';
      ctx.fill();
      ctx.strokeStyle = objectReached ? '#16a34a' : '#f59e0b';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw target rings
      ctx.beginPath();
      ctx.arc(target.x, target.y, target.radius * 0.6, 0, Math.PI * 2);
      ctx.strokeStyle = objectReached ? '#16a34a' : '#f59e0b';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Target label
      ctx.fillStyle = objectReached ? '#16a34a' : '#f59e0b';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`מטרה ${index + 1}`, target.x, target.y);
    });

    // Draw objects
    objects.forEach(obj => {
      // Shadow
      ctx.beginPath();
      ctx.arc(obj.x + 3, obj.y + 3, obj.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fill();

      // Object
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(
        obj.x - obj.radius * 0.3,
        obj.y - obj.radius * 0.3,
        0,
        obj.x,
        obj.y,
        obj.radius
      );
      gradient.addColorStop(0, obj.color);
      gradient.addColorStop(1, adjustColor(obj.color, -30));
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = adjustColor(obj.color, -50);
      ctx.lineWidth = 2;
      ctx.stroke();

      // Mass label
      ctx.fillStyle = 'white';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`m=${obj.mass}`, obj.x, obj.y);

      // Selection indicator
      if (selectedObject === obj.id && !obj.reachedTarget) {
        ctx.beginPath();
        ctx.arc(obj.x, obj.y, obj.radius + 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Draw drag line
    if (isDragging && selectedObject !== null) {
      const obj = objects.find(o => o.id === selectedObject);
      if (obj) {
        ctx.beginPath();
        ctx.moveTo(obj.x, obj.y);
        ctx.lineTo(dragCurrent.x, dragCurrent.y);
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw arrow head
        const angle = Math.atan2(obj.y - dragCurrent.y, obj.x - dragCurrent.x);
        const arrowLength = 15;
        ctx.beginPath();
        ctx.moveTo(dragCurrent.x, dragCurrent.y);
        ctx.lineTo(
          dragCurrent.x + arrowLength * Math.cos(angle - Math.PI / 6),
          dragCurrent.y + arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(dragCurrent.x, dragCurrent.y);
        ctx.lineTo(
          dragCurrent.x + arrowLength * Math.cos(angle + Math.PI / 6),
          dragCurrent.y + arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Force indicator
        const force = Math.sqrt(
          Math.pow((obj.x - dragCurrent.x) * FORCE_MULTIPLIER, 2) +
          Math.pow((obj.y - dragCurrent.y) * FORCE_MULTIPLIER, 2)
        );
        ctx.fillStyle = '#8b5cf6';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`כוח: ${force.toFixed(1)}N`, (obj.x + dragCurrent.x) / 2, (obj.y + dragCurrent.y) / 2 - 15);
      }
    }
  }, [objects, isDragging, dragCurrent, selectedObject, currentLevel]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicked on an object
    const clickedObject = objects.find(obj => {
      const dx = x - obj.x;
      const dy = y - obj.y;
      return Math.sqrt(dx * dx + dy * dy) < obj.radius && !obj.reachedTarget;
    });

    if (clickedObject) {
      setSelectedObject(clickedObject.id);
      setIsDragging(true);
      setDragStart({ x, y });
      setDragCurrent({ x, y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setDragCurrent({ x, y });
  };

  const handleMouseUp = () => {
    if (isDragging && selectedObject !== null) {
      const obj = objects.find(o => o.id === selectedObject);
      if (obj) {
        const dx = dragStart.x - dragCurrent.x;
        const dy = dragStart.y - dragCurrent.y;
        const appliedForce = Math.sqrt(
          Math.pow(dx * FORCE_MULTIPLIER, 2) +
          Math.pow(dy * FORCE_MULTIPLIER, 2)
        );

        setObjects(prev =>
          prev.map(o =>
            o.id === selectedObject
              ? {
                  ...o,
                  vx: (dx * FORCE_MULTIPLIER) / o.mass,
                  vy: (dy * FORCE_MULTIPLIER) / o.mass,
                }
              : o
          )
        );

        if (currentLevel === 2 && appliedForce > 0) {
          setForceData({
            obj1Force: selectedObject === 1 ? appliedForce : 0,
            obj2Force: selectedObject === 2 ? appliedForce : 0,
            isColliding: false,
          });
        }
      }
    }
    setIsDragging(false);
    setSelectedObject(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4" dir="rtl">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-slate-800 mb-2 flex items-center justify-center gap-3">
            <Zap className="w-10 h-10 text-yellow-500" />
            משחק כוח ותנועה - פיזיקה
            <Scale className="w-10 h-10 text-blue-500" />
          </h1>
          <p className="text-slate-600 text-lg">למדו את חוקי ניוטון בדרך מהנה!</p>
        </div>

        {/* Main Game Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Game Canvas */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-red-500" />
                  {levels[currentLevel].name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">ניקוד: {score}</span>
                  {gameWon && (
                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
                      <Trophy className="w-4 h-4" />
                      שלב הושלם!
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  width={700}
                  height={400}
                  className="w-full border-2 border-slate-200 rounded-lg cursor-crosshair bg-white"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
                {showInstructions && (
                  <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                    <div className="bg-white p-6 rounded-lg max-w-md text-center">
                      <h3 className="text-xl font-bold mb-3">איך משחקים?</h3>
                      <ul className="text-right text-sm space-y-2 mb-4" dir="rtl">
                        <li>🎯 לחצו וגררו על כדור כדי להפעיל כוח</li>
                        <li>📏 ככל שתגררו יותר רחוק = יותר כוח (F=ma!)</li>
                        <li>⚖️ כדורים כבדים צריכים יותר כוח</li>
                        <li>🎉 העבירו את כל הכדורים למטרות שלהם כדי לנצח!</li>
                      </ul>
                      <Button onClick={() => setShowInstructions(false)}>
                        <Play className="w-4 h-4 mr-2" />
                        התחל לשחק
                      </Button>
                    </div>
                  </div>
                )}
                {gameWon && (
                  <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                    <div className="bg-white p-6 rounded-lg text-center animate-bounce">
                      <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-3" />
                      <h3 className="text-2xl font-bold mb-2">השלב הושלם!</h3>
                      <p className="text-slate-600 mb-4">שלטת ב{levels[currentLevel].name}!</p>
                      <div className="flex gap-2 justify-center">
                        <Button onClick={resetLevel} variant="outline">
                          <RotateCcw className="w-4 h-4 mr-2" />
                          שחק שוב
                        </Button>
                      </div>
                      <p className="text-sm text-slate-500 mt-3">
                        השתמש במספרי השלבים למטה כדי לעבור לשלב הבא
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center mt-4">
                <div className="flex gap-2">
                  <Button onClick={resetLevel} variant="outline" size="sm">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    איפוס שלב
                  </Button>
                  <Button onClick={() => setShowInstructions(true)} variant="outline" size="sm">
                    <Info className="w-4 h-4 mr-2" />
                    הוראות
                  </Button>
                </div>
                <div className="flex gap-1">
                  {levels.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentLevel(idx)}
                      className={`w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
                        idx === currentLevel
                          ? 'bg-blue-500 text-white'
                          : idx < currentLevel
                          ? 'bg-green-500 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Level Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">מידע על השלב</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600 mb-4">{levels[currentLevel].description}</p>
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800 font-medium">{levels[currentLevel].law}</p>
                </div>
              </CardContent>
            </Card>

            {/* Force Display for Level 3 */}
            {currentLevel === 2 && (
              <Card className="border-purple-300">
                <CardHeader className="bg-purple-50">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Scale className="w-5 h-5 text-purple-600" />
                    מדידת כוחות - פעולה ותגובה
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className={`p-3 rounded-lg border-2 transition-all ${
                      forceData.isColliding ? 'bg-red-100 border-red-400' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                          <span className="font-semibold">כדור כחול</span>
                        </div>
                        <span className="text-lg font-bold text-blue-600">
                          {forceData.obj1Force.toFixed(2)} N
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-3">
                        <div 
                          className="bg-blue-500 h-3 rounded-full transition-all duration-100"
                          style={{ width: `${Math.min(forceData.obj1Force * 5, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className={`p-3 rounded-lg border-2 transition-all ${
                      forceData.isColliding ? 'bg-red-100 border-red-400' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-green-500"></div>
                          <span className="font-semibold">כדור ירוק</span>
                        </div>
                        <span className="text-lg font-bold text-green-600">
                          {forceData.obj2Force.toFixed(2)} N
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-3">
                        <div 
                          className="bg-green-500 h-3 rounded-full transition-all duration-100"
                          style={{ width: `${Math.min(forceData.obj2Force * 5, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    {forceData.isColliding && (
                      <div className="bg-yellow-100 p-3 rounded-lg border border-yellow-400 text-center animate-pulse">
                        <p className="font-bold text-yellow-800">💥 התנגשות!</p>
                        <p className="text-sm text-yellow-700">
                          הכוחות שווים! |F₁| = |F₂| ✓
                        </p>
                      </div>
                    )}

                    <div className="text-xs text-slate-500 text-center mt-2">
                      💡 שימו לב: כשהכדורים מתנגשים, הכוחות שווים בגודלם ונגדיים בכיוונם!
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Physics Concepts */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">מושגי פיזיקה</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-semibold mb-1">חוק ראשון - אינרציה</p>
                    <p className="text-slate-600">עצמים מתנגדים לשינויים בתנועתם. כדור במנוחה נשאר במנוחה עד שתפעילו עליו כוח!</p>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">חוק שני - F = ma</p>
                    <p className="text-slate-600">כוח שווה למסה כפול תאוצה. לעצמים כבדים יש צורך ביותר כוח כדי להזיז את אותו המרחק.</p>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">חוק שלישי - פעולה ותגובה</p>
                    <p className="text-slate-600">כששני עצמים מתנגשים, הם מפעילים זה על זה כוחות שווים ונגדיים.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Object Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">עצמים במשחק</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {objects.map((obj, idx) => (
                    <div
                      key={obj.id}
                      className={`flex items-center justify-between p-2 rounded-lg ${
                        obj.reachedTarget ? 'bg-green-50 border border-green-200' : 'bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full"
                          style={{ backgroundColor: obj.color }}
                        />
                        <span className="text-sm font-medium">כדור {idx + 1}</span>
                      </div>
                      <div className="text-sm text-slate-600">
                        מסה: {obj.mass}ק"ג {obj.reachedTarget && '✓'}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* About the Assignment */}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <Info className="w-4 h-4 mr-2" />
                  על המטלה
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>הערכה חלופית - בואו נשחק!</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-sm" dir="rtl">
                  <p>
                    משחק אינטראקטיבי זה נוצר כהערכה חלופית לכיתה ח' בפיזיקה,
                    המדגים הבנה של מושגי <strong>כוח ותנועה</strong>.
                  </p>
                  <div className="bg-slate-50 p-4 rounded-lg">
                    <p className="font-semibold mb-2">דרישות המטלה:</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-700">
                      <li>לבנות משחק המדגים מושגי פיזיקה</li>
                      <li>להראות הבנה של חוקי ניוטון</li>
                      <li>לכלול תנאי ניצחון ברורים</li>
                      <li>לגרום לזה להיות חינוכי ומהנה!</li>
                    </ul>
                  </div>
                  <p className="text-slate-600">
                    <strong>נוצר על ידי:</strong> מטלת תלמיד<br />
                    <strong>מקצוע:</strong> פיזיקה - כוח ותנועה<br />
                    <strong>כיתה:</strong> ח'
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
