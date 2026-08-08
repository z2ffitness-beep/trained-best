import React, { useState, useMemo, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";

const BUILD_TAG = "2026-08-07-1";
import {
  Dumbbell, Users, MessageSquare, LayoutGrid, Calendar, BookOpen,
  Flame, TrendingUp, Clock, ChevronRight, ChevronLeft, Plus, X,
  Search, Check, User, LogOut, Send, Image as ImageIcon, Settings,
  Target, Award, Activity, BarChart3, Salad, ClipboardList, Play,
  Pause, RotateCcw, ArrowRight, Shield, Zap, Trophy, Home, Mail,
  ChevronDown, ChevronUp, Star, CheckCircle2, Circle, Edit3, Trash2,
  Sparkles, Bot, RefreshCw, AlertCircle, Swords, HeartPulse, Ruler,
  Scale, ChevronsUpDown, Wand2, Loader2, Eye, EyeOff
} from "lucide-react";
// Auto-generated exercise image assets (base64 JPEG thumbnails, 480px wide)
import { EXERCISE_IMAGES } from "./exerciseImages";

function exerciseImage(name) {
  return EXERCISE_IMAGES[name] || null;
}

/* ============================================================
   TRAINEDBEST v2 — prototype, in-memory data
   Design: charcoal/bone/performance-orange, scoreboard typography
============================================================ */

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap";

const C = {
  bg: "#000000", panel: "#111214", panelAlt: "#0A0A0B", border: "#222428",
  text: "#FFFFFF", sub: "#9BA1AA", faint: "#5C6066",
  orange: "#3B6FED", blue: "#5B8DEF", steel: "#2A3A52", olive: "#34C77B", oliveDeep: "#1F8F58",
  amber: "#F0A93C", red: "#FF5C5C",
  gradFrom: "#3B6FED", gradTo: "#6E9AF8"
};

// ---------- phase ordering (the canonical workout structure) ----------
const PHASES = [
  { key: "warmup_general", label: "Dynamic Warmup", short: "Warmup" },
  { key: "warmup_specific", label: "Primer", short: "Primer" },
  { key: "explosive", label: "Plyometrics / Med Ball", short: "Plyo" },
  { key: "compound", label: "Strength — Main Movements", short: "Strength" },
  { key: "hypertrophy", label: "Strength — Accessories", short: "Accessories" },
  { key: "lactic", label: "Cardio", short: "Cardio" },
  { key: "aerobic", label: "Aerobic (own day if lengthy)", short: "Aerobic" },
  { key: "cooldown", label: "Static Stretch & Cooldown", short: "Cooldown" },
];
const phaseIndex = key => PHASES.findIndex(p => p.key === key);

// ---------- movement patterns (for accurate swapping) ----------
const PATTERNS = [
  "Squat", "Hinge", "Lunge", "Horizontal Push", "Horizontal Pull",
  "Vertical Push", "Vertical Pull", "Rotation / Anti-Rotation",
  "Carry", "Throw / Slam", "Jump / Plyo", "Sprint / Locomotion",
  "Strike / Combat", "Mobility", "Core / Anti-Extension"
];

// ---------- exercise database (real performance training content) ----------
const SEED_EXERCISES = [
  // warmup general
  { id: "e1", name: "World's Greatest Stretch", phase: "warmup_general", pattern: "Mobility", hasMedia: true },
  { id: "e2", name: "Leg Swings (Front & Lateral)", phase: "warmup_general", pattern: "Mobility", hasMedia: false },
  { id: "e3", name: "Band Pull Aparts", phase: "warmup_specific", pattern: "Horizontal Pull", hasMedia: true },
  { id: "e4", name: "Inchworm to Push-Up", phase: "warmup_general", pattern: "Mobility", hasMedia: false },
  { id: "e5", name: "Hip 90/90 Switch", phase: "warmup_general", pattern: "Mobility", hasMedia: false },
  { id: "e6", name: "Band Shoulder Dislocates", phase: "warmup_specific", pattern: "Mobility", hasMedia: false, injuryTag: "shoulder" },
  { id: "e7", name: "Banded Terminal Knee Extension", phase: "warmup_specific", pattern: "Mobility", hasMedia: false, injuryTag: "knee" },
  { id: "e98", name: "Dead Bugs", phase: "warmup_general", pattern: "Core / Anti-Extension", hasMedia: true },
  { id: "e8", name: "Cat-Cow + Bird Dog", phase: "warmup_specific", pattern: "Core / Anti-Extension", hasMedia: true, injuryTag: "low back" },
  { id: "e9", name: "Ankle Banded Dorsiflexion Drill", phase: "warmup_specific", pattern: "Mobility", hasMedia: false, injuryTag: "ankle" },
  { id: "e101", name: "Banded Anti Rotation Walk Outs", phase: "warmup_specific", pattern: "Rotation / Anti-Rotation", hasMedia: true },
  { id: "e58", name: "Banded Lateral Walks", phase: "warmup_specific", pattern: "Mobility", hasMedia: true, injuryTag: "hip" },
  { id: "e59", name: "Banded Hip Flexor Raises", phase: "warmup_specific", pattern: "Mobility", hasMedia: true, injuryTag: "hip" },
  { id: "e60", name: "Banded Neck Iso Holds", phase: "warmup_specific", pattern: "Mobility", hasMedia: true, injuryTag: "neck" },
  { id: "e61", name: "Scapular Push Ups", phase: "warmup_specific", pattern: "Horizontal Push", hasMedia: true, injuryTag: "shoulder" },
  { id: "e62", name: "Scapular Pull Ups", phase: "warmup_specific", pattern: "Vertical Pull", hasMedia: true, injuryTag: "shoulder" },
  { id: "e63", name: "Band External Rotation", phase: "warmup_specific", pattern: "Mobility", hasMedia: true, injuryTag: "shoulder" },

  // compound
  { id: "e10", name: "Back Squat", phase: "compound", pattern: "Squat", hasMedia: true },
  { id: "e11", name: "Front Squat", phase: "compound", pattern: "Squat", hasMedia: true },
  { id: "e12", name: "Trap Bar Deadlift", phase: "compound", pattern: "Hinge", hasMedia: true },
  { id: "e13", name: "Conventional Deadlift", phase: "compound", pattern: "Hinge", hasMedia: true },
  { id: "e14", name: "Romanian Deadlift", phase: "compound", pattern: "Hinge", hasMedia: true },
  { id: "e15", name: "Bench Press", phase: "compound", pattern: "Horizontal Push", hasMedia: true },
  { id: "e16", name: "Weighted Pull-Up", phase: "compound", pattern: "Vertical Pull", hasMedia: true },
  { id: "e17", name: "Dumbbell Bulgarian Split Squat", phase: "compound", pattern: "Lunge", hasMedia: true },
  { id: "e18", name: "Landmine Press", phase: "compound", pattern: "Vertical Push", hasMedia: false },
  { id: "e19", name: "Overhead Press", phase: "compound", pattern: "Vertical Push", hasMedia: true },
  { id: "e64", name: "Single Arm Dumbbell Row", phase: "compound", pattern: "Horizontal Pull", hasMedia: true },
  { id: "e65", name: "Barbell Floor Press", phase: "compound", pattern: "Horizontal Push", hasMedia: true },
  { id: "e66", name: "Barbell Shoulder Shrugs", phase: "compound", pattern: "Carry", hasMedia: true },
  { id: "e104", name: "Inverted Row", phase: "compound", pattern: "Horizontal Pull", hasMedia: true },
  { id: "e105", name: "Zercher Squat", phase: "compound", pattern: "Squat", hasMedia: true },
  { id: "e106", name: "Pin Squat", phase: "compound", pattern: "Squat", hasMedia: true },
  { id: "e82", name: "Safety Bar Squat", phase: "compound", pattern: "Squat", hasMedia: true },
  { id: "e83", name: "Barbell Row", phase: "compound", pattern: "Horizontal Pull", hasMedia: true },
  { id: "e84", name: "Barbell Shoulder Press", phase: "compound", pattern: "Vertical Push", hasMedia: true },
  { id: "e85", name: "Dumbbell Bench Press", phase: "compound", pattern: "Horizontal Push", hasMedia: true },

  // explosive / power
  { id: "e20", name: "Power Clean", phase: "explosive", pattern: "Hinge", hasMedia: true },
  { id: "e21", name: "Box Jump", phase: "explosive", pattern: "Jump / Plyo", hasMedia: false },
  { id: "e22", name: "Depth Jump", phase: "explosive", pattern: "Jump / Plyo", hasMedia: false },
  { id: "e23", name: "Broad Jump", phase: "explosive", pattern: "Jump / Plyo", hasMedia: true },
  { id: "e24", name: "Med Ball Rotational Slam", phase: "explosive", pattern: "Throw / Slam", hasMedia: true },
  { id: "e25", name: "Med Ball Chest Pass", phase: "explosive", pattern: "Throw / Slam", hasMedia: false },
  { id: "e26", name: "Med Ball Overhead Slam", phase: "explosive", pattern: "Throw / Slam", hasMedia: false },
  { id: "e27", name: "Landmine Rotational Throw", phase: "explosive", pattern: "Rotation / Anti-Rotation", hasMedia: false },
  { id: "e28", name: "Lateral Bound", phase: "explosive", pattern: "Jump / Plyo", hasMedia: false },
  { id: "e29", name: "Resisted Sprint Start (Band)", phase: "explosive", pattern: "Sprint / Locomotion", hasMedia: false },
  { id: "e30", name: "Heavy Bag Punch Combo (Power)", phase: "explosive", pattern: "Strike / Combat", hasMedia: false },
  { id: "e31", name: "Battle Rope Power Slam", phase: "explosive", pattern: "Strike / Combat", hasMedia: false },
  { id: "e67", name: "Sprints", phase: "explosive", pattern: "Sprint / Locomotion", hasMedia: true },
  { id: "e68", name: "Pogo Jumps", phase: "explosive", pattern: "Jump / Plyo", hasMedia: true },
  { id: "e69", name: "Standing Landmine Rotations", phase: "explosive", pattern: "Rotation / Anti-Rotation", hasMedia: true },
  { id: "e75", name: "Speed Skaters", phase: "explosive", pattern: "Jump / Plyo", hasMedia: true },
  { id: "e99", name: "Max Height Jumps", phase: "explosive", pattern: "Jump / Plyo", hasMedia: true },
  { id: "e100", name: "Single Leg Bounds", phase: "explosive", pattern: "Jump / Plyo", hasMedia: true },
  { id: "e76", name: "Alternating Jumping Split Lunges", phase: "explosive", pattern: "Jump / Plyo", hasMedia: true },
  { id: "e77", name: "Backwards Overhead Throws", phase: "explosive", pattern: "Throw / Slam", hasMedia: true },
  { id: "e78", name: "Ground Chest Pass", phase: "explosive", pattern: "Throw / Slam", hasMedia: true },
  { id: "e79", name: "Explosive Wall Chest Pass", phase: "explosive", pattern: "Throw / Slam", hasMedia: true },
  { id: "e86", name: "Dumbbell Single Arm Snatch", phase: "explosive", pattern: "Hinge", hasMedia: true },
  { id: "e87", name: "Barbell High Pull", phase: "explosive", pattern: "Hinge", hasMedia: true },
  { id: "e88", name: "Trap Bar Jumps", phase: "explosive", pattern: "Jump / Plyo", hasMedia: true },

  // hypertrophy
  { id: "e32", name: "Dumbbell Incline Press", phase: "hypertrophy", pattern: "Horizontal Push", hasMedia: false },
  { id: "e33", name: "Chest-Supported Row", phase: "hypertrophy", pattern: "Horizontal Pull", hasMedia: false },
  { id: "e34", name: "Lat Pulldown", phase: "hypertrophy", pattern: "Vertical Pull", hasMedia: true },
  { id: "e35", name: "Walking Lunge", phase: "hypertrophy", pattern: "Lunge", hasMedia: false },
  { id: "e36", name: "Leg Press", phase: "hypertrophy", pattern: "Squat", hasMedia: false },
  { id: "e37", name: "Landmine Single-Arm Row", phase: "hypertrophy", pattern: "Horizontal Pull", hasMedia: false },
  { id: "e38", name: "Cable Lateral Raise", phase: "hypertrophy", pattern: "Vertical Push", hasMedia: false },
  { id: "e39", name: "Hamstring Curl", phase: "hypertrophy", pattern: "Hinge", hasMedia: true },
  { id: "e40", name: "Farmer's Carry", phase: "hypertrophy", pattern: "Carry", hasMedia: false },
  { id: "e41", name: "Suitcase Carry", phase: "hypertrophy", pattern: "Carry", hasMedia: false },
  { id: "e42", name: "Cable Woodchopper", phase: "hypertrophy", pattern: "Rotation / Anti-Rotation", hasMedia: false },
  { id: "e70", name: "Dumbbell Oblique Side Bends", phase: "hypertrophy", pattern: "Core / Anti-Extension", hasMedia: true },
  { id: "e80", name: "Barbell Glute Bridge", phase: "hypertrophy", pattern: "Hinge", hasMedia: true },
  { id: "e81", name: "Seal Row", phase: "hypertrophy", pattern: "Horizontal Pull", hasMedia: true },
  { id: "e89", name: "Dumbbell Chest Fly", phase: "hypertrophy", pattern: "Horizontal Push", hasMedia: true },
  { id: "e90", name: "Seated Barbell Tricep Extension", phase: "hypertrophy", pattern: "Vertical Push", hasMedia: true },
  { id: "e91", name: "Barbell Tricep Extension (Lying)", phase: "hypertrophy", pattern: "Horizontal Push", hasMedia: true },
  { id: "e92", name: "Single Arm Dumbbell Tricep Extension", phase: "hypertrophy", pattern: "Vertical Push", hasMedia: true },
  { id: "e93", name: "Dumbbell Wrestler Cheat Curls", phase: "hypertrophy", pattern: "Vertical Pull", hasMedia: true },
  { id: "e94", name: "Dumbbell Rear Delt Flyes", phase: "hypertrophy", pattern: "Horizontal Pull", hasMedia: true },
  { id: "e95", name: "Dumbbell Lateral Raise", phase: "hypertrophy", pattern: "Vertical Push", hasMedia: true },
  { id: "e96", name: "Barbell Curl", phase: "hypertrophy", pattern: "Vertical Pull", hasMedia: true },
  { id: "e97", name: "Dumbbell Alternating Curl", phase: "hypertrophy", pattern: "Vertical Pull", hasMedia: true },

  // lactic
  { id: "e107", name: "Ski Erg Intervals", phase: "lactic", pattern: "Sprint / Locomotion", hasMedia: true },
  { id: "e103", name: "Battle Ropes", phase: "lactic", pattern: "Strike / Combat", hasMedia: true },
  { id: "e43", name: "Sled Push (Heavy)", phase: "lactic", pattern: "Sprint / Locomotion", hasMedia: true },
  { id: "e44", name: "Battle Rope Wave Intervals", phase: "lactic", pattern: "Strike / Combat", hasMedia: false },
  { id: "e45", name: "Bag Round (3min Combos)", phase: "lactic", pattern: "Strike / Combat", hasMedia: false },
  { id: "e46", name: "Assault Bike Sprint Intervals", phase: "lactic", pattern: "Sprint / Locomotion", hasMedia: false },
  { id: "e47", name: "Kettlebell Swing Complex", phase: "lactic", pattern: "Hinge", hasMedia: true },
  { id: "e48", name: "Burpee Broad Jump Combo", phase: "lactic", pattern: "Jump / Plyo", hasMedia: false },

  // aerobic
  { id: "e49", name: "Zone 2 Bike", phase: "aerobic", pattern: "Sprint / Locomotion", hasMedia: false },
  { id: "e50", name: "Incline Treadmill Walk", phase: "aerobic", pattern: "Sprint / Locomotion", hasMedia: false },
  { id: "e51", name: "Jump Rope (Steady State)", phase: "aerobic", pattern: "Jump / Plyo", hasMedia: false },
  { id: "e52", name: "Rowing Erg Steady State", phase: "aerobic", pattern: "Horizontal Pull", hasMedia: false },

  // cooldown
  { id: "e53", name: "Couch Stretch", phase: "cooldown", pattern: "Mobility", hasMedia: false },
  { id: "e54", name: "Pigeon Stretch", phase: "cooldown", pattern: "Mobility", hasMedia: true },
  { id: "e55", name: "Doorway Pec Stretch", phase: "cooldown", pattern: "Mobility", hasMedia: false },
  { id: "e56", name: "Box Breathing (Down-regulation)", phase: "cooldown", pattern: "Mobility", hasMedia: false },
  { id: "e57", name: "Foam Roll — Full Body", phase: "cooldown", pattern: "Mobility", hasMedia: false },
  { id: "e102", name: "90/90 Hip Stretch", phase: "cooldown", pattern: "Mobility", hasMedia: true },
  { id: "e71", name: "Cobra to Downward Dog", phase: "cooldown", pattern: "Mobility", hasMedia: true },
  { id: "e72", name: "The Erector Stretch", phase: "cooldown", pattern: "Mobility", hasMedia: true },
  { id: "e73", name: "Frog Stretch", phase: "cooldown", pattern: "Mobility", hasMedia: true },
  { id: "e74", name: "Butterfly Stretch", phase: "cooldown", pattern: "Mobility", hasMedia: true },
];

function exercisesByPhase(phaseKey) { return SEED_EXERCISES.filter(e => e.phase === phaseKey); }
function exercisesByPattern(pattern, excludeId) { return SEED_EXERCISES.filter(e => e.pattern === pattern && e.id !== excludeId); }

// ---------- unit conversion ----------
const kgToLb = kg => Math.round(kg * 2.20462 * 10) / 10;
const lbToKg = lb => Math.round((lb / 2.20462) * 10) / 10;
const cmToFtIn = cm => { const totalIn = cm / 2.54; const ft = Math.floor(totalIn / 12); const inch = Math.round(totalIn % 12); return { ft, inch }; };
const ftInToCm = (ft, inch) => Math.round((ft * 12 + inch) * 2.54);

// ---------- date helpers (workoutLogs store dates as YYYY-MM-DD) ----------
const todayISO = () => new Date().toISOString().slice(0, 10);
const formatLogDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso; // fallback for any legacy non-ISO strings
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// ---------- training volume recommendation ----------
function recommendVolume(daysPerWeek, experience) {
  const base = {
    "New to training": { 2: "2 full-body sessions", 3: "3 full-body sessions", 4: "Upper/Lower split", 5: "Upper/Lower + 1 conditioning", 6: "Push/Pull/Legs x2" },
    "Beginner": { 2: "2 full-body sessions", 3: "3 full-body sessions", 4: "Upper/Lower split", 5: "Upper/Lower + conditioning", 6: "Push/Pull/Legs x2" },
    "Intermediate": { 3: "3-day split, moderate volume", 4: "Upper/Lower split", 5: "Body-part split + conditioning", 6: "Push/Pull/Legs x2 + skill" },
    "Advanced": { 4: "Upper/Lower, high intensity", 5: "Body-part split, high volume", 6: "PPL x2 + sport-specific skill", 7: "PPL x2 + 1 active recovery" },
  };
  const tier = base[experience] || base["Beginner"];
  return tier[daysPerWeek] || tier[Object.keys(tier).map(Number).sort((a,b)=>a-b).find(d => d >= daysPerWeek)] || "Custom split recommended";
}

// ---------- seed roster / programs / messages (unchanged shape, updated content) ----------
const SEED_ATHLETES = [
  { id: "a1", name: "Jordan Reyes", sex: "male", sport: "MMA", streak: 12, lastActive: "Today", avatar: "JR", program: "p1", injuries: ["shoulder"], goals: ["Athletic Performance", "Build Muscle"], isFighter: true, weightKg: 79.4, heightCm: 180 },
  { id: "a2", name: "Maya Chen", sex: "female", sport: "General Fitness", streak: 5, lastActive: "Yesterday", avatar: "MC", program: "p2", injuries: [], goals: ["Build Muscle"], isFighter: false, weightKg: 61.2, heightCm: 165 },
  { id: "a3", name: "Devon Brooks", sex: "male", sport: "MMA", streak: 21, lastActive: "Today", avatar: "DB", program: "p1", injuries: ["knee"], goals: ["Athletic Performance"], isFighter: true, weightKg: 84.8, heightCm: 178 },
  { id: "a4", name: "Sofia Marsh", sex: "female", sport: "General Fitness", streak: 0, lastActive: "5 days ago", avatar: "SM", program: null, injuries: ["low back"], goals: ["Fat Loss", "Build Muscle"], isFighter: false, weightKg: 58.1, heightCm: 162 },
];

function buildDay(name, phaseSelections) {
  // phaseSelections: { phaseKey: [exerciseIds with sets/reps/rpe/rest] }
  const exercises = [];
  PHASES.forEach(p => {
    (phaseSelections[p.key] || []).forEach(x => exercises.push({ id: "x" + Math.random().toString(36).slice(2, 9), phase: p.key, ...x }));
  });
  return { id: "d" + Math.random().toString(36).slice(2, 9), name, exercises };
}

const SEED_PROGRAMS = [
  {
    id: "p1", name: "MMA Camp — Power & Conditioning", weeks: 6, assignedCount: 0, sport: "MMA",
    days: [
      buildDay("Day 1 — Power & Strike Conditioning", {
        warmup_general: [{ exerciseId: "e1", sets: 1, reps: "8/side", rpe: 4, rest: "—" }, { exerciseId: "e2", sets: 1, reps: "10/side", rpe: 4, rest: "—" }],
        warmup_specific: [{ exerciseId: "e6", sets: 2, reps: "10", rpe: 4, rest: "30s" }],
        compound: [{ exerciseId: "e10", sets: 4, reps: "4", rpe: 8, rest: "3min" }],
        explosive: [{ exerciseId: "e30", sets: 4, reps: "30s", rpe: 8, rest: "60s" }, { exerciseId: "e26", sets: 3, reps: "8", rpe: 7, rest: "60s" }],
        hypertrophy: [{ exerciseId: "e37", sets: 3, reps: "10/side", rpe: 7, rest: "60s" }],
        lactic: [{ exerciseId: "e45", sets: 3, reps: "3min", rpe: 9, rest: "60s" }],
        aerobic: [],
        cooldown: [{ exerciseId: "e55", sets: 1, reps: "60s/side", rpe: 2, rest: "—" }, { exerciseId: "e56", sets: 1, reps: "2min", rpe: 1, rest: "—" }],
      }),
      buildDay("Day 2 — Lower Power", {
        warmup_general: [{ exerciseId: "e4", sets: 1, reps: "8", rpe: 4, rest: "—" }, { exerciseId: "e5", sets: 1, reps: "8/side", rpe: 4, rest: "—" }],
        warmup_specific: [{ exerciseId: "e7", sets: 2, reps: "12", rpe: 4, rest: "30s" }],
        compound: [{ exerciseId: "e12", sets: 5, reps: "3", rpe: 8, rest: "3min" }],
        explosive: [{ exerciseId: "e21", sets: 4, reps: "5", rpe: 7, rest: "2min" }, { exerciseId: "e28", sets: 3, reps: "5/side", rpe: 7, rest: "90s" }],
        hypertrophy: [{ exerciseId: "e35", sets: 3, reps: "12/side", rpe: 7, rest: "60s" }],
        lactic: [{ exerciseId: "e43", sets: 4, reps: "20m", rpe: 8, rest: "90s" }],
        aerobic: [],
        cooldown: [{ exerciseId: "e54", sets: 1, reps: "60s/side", rpe: 2, rest: "—" }],
      }),
      buildDay("Day 3 — Conditioning & Aerobic Base", {
        warmup_general: [{ exerciseId: "e1", sets: 1, reps: "8/side", rpe: 4, rest: "—" }],
        warmup_specific: [],
        compound: [],
        explosive: [{ exerciseId: "e24", sets: 4, reps: "8/side", rpe: 7, rest: "60s" }],
        hypertrophy: [],
        lactic: [{ exerciseId: "e44", sets: 5, reps: "30s on/30s off", rpe: 9, rest: "—" }],
        aerobic: [{ exerciseId: "e49", sets: 1, reps: "25min", rpe: 5, rest: "—" }],
        cooldown: [{ exerciseId: "e57", sets: 1, reps: "5min", rpe: 1, rest: "—" }],
      }),
    ]
  },
  {
    id: "p2", name: "Build Muscle — Foundations", weeks: 4, assignedCount: 0, sport: "General Fitness",
    days: [
      buildDay("Day 1 — Upper Body", {
        warmup_general: [{ exerciseId: "e3", sets: 2, reps: "15", rpe: 3, rest: "—" }],
        warmup_specific: [], compound: [{ exerciseId: "e15", sets: 4, reps: "6", rpe: 7, rest: "2min" }],
        explosive: [], hypertrophy: [{ exerciseId: "e32", sets: 3, reps: "10", rpe: 7, rest: "75s" }, { exerciseId: "e33", sets: 3, reps: "12", rpe: 7, rest: "75s" }],
        lactic: [], aerobic: [], cooldown: [{ exerciseId: "e55", sets: 1, reps: "45s/side", rpe: 2, rest: "—" }],
      }),
    ]
  },
];

const SEED_MESSAGES = {
  a1: [
    { id: "m1", from: "coach", text: "Great work on the squat session — numbers looking strong.", time: "9:14 AM" },
    { id: "m2", from: "athlete", text: "Felt heavy today but got all reps in!", time: "9:20 AM" },
  ],
  a2: [{ id: "m3", from: "athlete", text: "Can we swap tomorrow's sprint work? Shin's a little sore.", time: "Yesterday" }],
  a3: [{ id: "m4", from: "coach", text: "21 day streak. That's elite consistency, Devon.", time: "2 days ago" }],
  a4: [],
};

const SEED_PROGRESS = [
  { date: "May 20", weightKg: 80.7, bodyFat: 14.2 },
  { date: "May 27", weightKg: 80.3, bodyFat: 13.9 },
  { date: "Jun 3", weightKg: 80.1, bodyFat: 13.6 },
  { date: "Jun 10", weightKg: 79.8, bodyFat: 13.4 },
  { date: "Jun 17", weightKg: 79.4, bodyFat: 13.1 },
];

const SEED_WORKOUT_LOGS = [
  { id: "l1", date: "2026-06-17", programDay: "Day 1 — Power & Strike Conditioning", duration: 58, mood: "strong" },
  { id: "l2", date: "2026-06-15", programDay: "Day 3 — Conditioning & Aerobic Base", duration: 64, mood: "good" },
  { id: "l3", date: "2026-06-13", programDay: "Day 2 — Lower Power", duration: 49, mood: "tough" },
];

const AI_SUGGESTED = [
  { id: "ai1", from: "ai", text: "Hey! I'm your AI training assistant. Ask me about form cues, recovery, or anything about your program.", time: "" },
];

const SEED_COMMUNITY = [
  { id: "c1", userId: "u_ext1", name: "Marcus T.", avatar: "MT", sport: "MMA", role: "athlete", text: "Just hit a new PR on trap bar deadlift — 405 for 3. The AI program has been dialing in my posterior chain work for the past 6 weeks. Anyone else seeing strength gains carry over to their wrestling?", likes: 14, liked: false, time: "2h ago", replies: [
    { id: "r1", userId: "u_ext2", name: "Coach Rivera", avatar: "CR", role: "coach", text: "Hip hinge strength absolutely transfers. Make sure you're pairing it with reactive work — single leg bounds, broad jumps.", time: "1h ago" },
    { id: "r2", userId: "u_ext3", name: "Dani K.", avatar: "DK", sport: "MMA", role: "athlete", text: "Yes! My shot is way more explosive since I added RDLs and trap bar work. Keeps going.", time: "45m ago" },
  ]},
  { id: "c2", userId: "u_ext4", name: "Sofia L.", avatar: "SL", sport: "General Fitness", role: "athlete", text: "Three months on the self-guided program and down 18lbs. Never thought I'd actually stick to something without a coach pushing me but the weekly accountability tracker is keeping me honest 💪", likes: 31, liked: false, time: "5h ago", replies: [
    { id: "r3", userId: "u_ext5", name: "Priya M.", avatar: "PM", sport: "General Fitness", role: "athlete", text: "That's incredible!! What's your split looking like right now?", time: "4h ago" },
  ]},
  { id: "c3", userId: "u_ext6", name: "Coach Kim", avatar: "CK", role: "coach", text: "Quick tip for anyone doing power cleans: if the bar is swinging away from your body in the second pull, you're losing your lat engagement. Think 'elbows high and outside' and keep the bar dragging up your thighs. Cuts the swing immediately.", likes: 22, liked: false, time: "8h ago", replies: [] },
  { id: "c4", userId: "u_ext7", name: "Ray J.", avatar: "RJ", sport: "MMA", role: "athlete", text: "6 weeks out from my first amateur MMA fight. Nervously excited. The AI built me a full camp program with the competition date locked in — it actually adjusted the block structure based on weeks out. Anyone else used this for fight camp?", likes: 19, liked: false, time: "1d ago", replies: [
    { id: "r4", userId: "u_ext8", name: "Coach Rivera", avatar: "CR", role: "coach", text: "Good luck Ray! Taper week is key — don't skip it no matter how good you feel.", time: "22h ago" },
    { id: "r5", userId: "u_ext9", name: "Marcus T.", avatar: "MT", sport: "MMA", role: "athlete", text: "Let us know how it goes. You've got this 🔥", time: "20h ago" },
  ]},
  { id: "c5", userId: "u_ext10", name: "Jasmine W.", avatar: "JW", sport: "General Fitness", role: "athlete", text: "Quick question — what's everyone eating post-workout? I've been doing a protein shake but wondering if whole food is better for recovery at this training volume.", likes: 8, liked: false, time: "2d ago", replies: [
    { id: "r6", userId: "u_ext11", name: "Coach Kim", avatar: "CK", role: "coach", text: "Either works. What matters most is getting 30-50g protein within 2hrs. Whole food is great if your digestion handles it post-training.", time: "1d ago" },
  ]},
];



// ---------- small primitives ----------
function PlateBadge({ value, label, accent = C.orange }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-full border-4 px-1 shrink-0"
      style={{ borderColor: accent, width: 78, height: 78, background: C.panel }}>
      <span className="font-mono font-bold text-base leading-none text-center" style={{ color: C.text }}>{value}</span>
      <span className="text-[8px] uppercase tracking-wider mt-1" style={{ color: C.sub }}>{label}</span>
    </div>
  );
}

function ChalkDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-6">
      <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${C.border}, transparent)` }} />
      {label && <span className="text-xs uppercase tracking-[0.2em] font-semibold shrink-0" style={{ color: C.sub, fontFamily: "Inter" }}>{label}</span>}
      <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${C.border}, transparent)` }} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent = C.orange }) {
  return (
    <div className="rounded-xl p-3.5 flex items-center gap-2.5 min-w-0" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="rounded-lg p-2 shrink-0" style={{ background: `${accent}22` }}>
        <Icon size={18} style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <div className="font-mono font-bold text-xl leading-tight truncate" style={{ color: C.text }}>{value}</div>
        <div className="text-[10px] uppercase tracking-wide truncate" style={{ color: C.sub }}>{label}</div>
        {sub && <div className="text-[10px] mt-0.5 truncate" style={{ color: accent }}>{sub}</div>}
      </div>
    </div>
  );
}

function Avatar({ initials, size = 40, accent = C.orange, photoUrl }) {
  if (photoUrl) {
    return (
      <div className="rounded-full overflow-hidden shrink-0" style={{ width: size, height: size }}>
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, background: `${accent}22`, color: accent, fontFamily: "Inter", fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

function EditableAvatar({ initials, size = 72, accent = C.orange, photoUrl, onChange }) {
  const inputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="relative inline-block">
      <Avatar initials={initials} size={size} accent={accent} photoUrl={photoUrl} />
      <button onClick={() => inputRef.current?.click()}
        className="absolute bottom-0 right-0 rounded-full flex items-center justify-center"
        style={{ width: size * 0.34, height: size * 0.34, background: C.orange, border: `2px solid ${C.bg}` }}>
        <ImageIcon size={size * 0.17} style={{ color: "#fff" }} />
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", className = "", icon: Icon, type = "button", disabled }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-full font-semibold text-sm px-4 py-2.5 transition-all active:scale-[0.98] shrink-0";
  const variants = {
    primary: { background: C.orange, color: "#FFFFFF" },
    secondary: { background: C.panel, color: C.text, border: `1px solid ${C.border}` },
    ghost: { background: "transparent", color: C.sub },
    danger: { background: "#3A1414", color: C.red },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${className}`}
      style={{ ...variants[variant], opacity: disabled ? 0.5 : 1 }}>
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

function Pill({ children, active, onClick, accent = C.orange }) {
  return (
    <button onClick={onClick} className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0"
      style={{ background: active ? accent : C.panel, color: active ? C.bg : C.sub, border: `1px solid ${active ? accent : C.border}` }}>
      {children}
    </button>
  );
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "#000000aa" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className={`w-full ${wide ? "sm:max-w-lg" : "sm:max-w-md"} rounded-t-2xl sm:rounded-2xl max-h-[88vh] flex flex-col`}
        style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ background: C.panel, borderBottom: `1px solid ${C.border}` }}>
          <h3 className="font-semibold text-lg" style={{ fontFamily: "Inter", color: C.text }}>{title}</h3>
          <button onClick={onClose} style={{ color: C.sub }}><X size={20} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (import React, { useState, useMemo, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";

const BUILD_TAG = "2026-08-07-1";
import {
  Dumbbell, Users, MessageSquare, LayoutGrid, Calendar, BookOpen,
  Flame, TrendingUp, Clock, ChevronRight, ChevronLeft, Plus, X,
  Search, Check, User, LogOut, Send, Image as ImageIcon, Settings,
  Target, Award, Activity, BarChart3, Salad, ClipboardList, Play,
  Pause, RotateCcw, ArrowRight, Shield, Zap, Trophy, Home, Mail,
  ChevronDown, ChevronUp, Star, CheckCircle2, Circle, Edit3, Trash2,
  Sparkles, Bot, RefreshCw, AlertCircle, Swords, HeartPulse, Ruler,
  Scale, ChevronsUpDown, Wand2, Loader2, Eye, EyeOff
} from "lucide-react";
// Auto-generated exercise image assets (base64 JPEG thumbnails, 480px wide)
import { EXERCISE_IMAGES } from "./exerciseImages";

function exerciseImage(name) {
  return EXERCISE_IMAGES[name] || null;
}

/* ============================================================
   TRAINEDBEST v2 — prototype, in-memory data
   Design: charcoal/bone/performance-orange, scoreboard typography
============================================================ */

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap";

const C = {
  bg: "#000000", panel: "#111214", panelAlt: "#0A0A0B", border: "#222428",
  text: "#FFFFFF", sub: "#9BA1AA", faint: "#5C6066",
  orange: "#3B6FED", blue: "#5B8DEF", steel: "#2A3A52", olive: "#34C77B", oliveDeep: "#1F8F58",
  amber: "#F0A93C", red: "#FF5C5C",
  gradFrom: "#3B6FED", gradTo: "#6E9AF8"
};

// ---------- phase ordering (the canonical workout structure) ----------
const PHASES = [
  { key: "warmup_general", label: "Dynamic Warmup", short: "Warmup" },
  { key: "warmup_specific", label: "Primer", short: "Primer" },
  { key: "explosive", label: "Plyometrics / Med Ball", short: "Plyo" },
  { key: "compound", label: "Strength — Main Movements", short: "Strength" },
  { key: "hypertrophy", label: "Strength — Accessories", short: "Accessories" },
  { key: "lactic", label: "Cardio", short: "Cardio" },
  { key: "aerobic", label: "Aerobic (own day if lengthy)", short: "Aerobic" },
  { key: "cooldown", label: "Static Stretch & Cooldown", short: "Cooldown" },
];
const phaseIndex = key => PHASES.findIndex(p => p.key === key);

// ---------- movement patterns (for accurate swapping) ----------
const PATTERNS = [
  "Squat", "Hinge", "Lunge", "Horizontal Push", "Horizontal Pull",
  "Vertical Push", "Vertical Pull", "Rotation / Anti-Rotation",
  "Carry", "Throw / Slam", "Jump / Plyo", "Sprint / Locomotion",
  "Strike / Combat", "Mobility", "Core / Anti-Extension"
];

// ---------- exercise database (real performance training content) ----------
const SEED_EXERCISES = [
  // warmup general
  { id: "e1", name: "World's Greatest Stretch", phase: "warmup_general", pattern: "Mobility", hasMedia: true },
  { id: "e2", name: "Leg Swings (Front & Lateral)", phase: "warmup_general", pattern: "Mobility", hasMedia: false },
  { id: "e3", name: "Band Pull Aparts", phase: "warmup_specific", pattern: "Horizontal Pull", hasMedia: true },
  { id: "e4", name: "Inchworm to Push-Up", phase: "warmup_general", pattern: "Mobility", hasMedia: false },
  { id: "e5", name: "Hip 90/90 Switch", phase: "warmup_general", pattern: "Mobility", hasMedia: false },
  { id: "e6", name: "Band Shoulder Dislocates", phase: "warmup_specific", pattern: "Mobility", hasMedia: false, injuryTag: "shoulder" },
  { id: "e7", name: "Banded Terminal Knee Extension", phase: "warmup_specific", pattern: "Mobility", hasMedia: false, injuryTag: "knee" },
  { id: "e98", name: "Dead Bugs", phase: "warmup_general", pattern: "Core / Anti-Extension", hasMedia: true },
  { id: "e8", name: "Cat-Cow + Bird Dog", phase: "warmup_specific", pattern: "Core / Anti-Extension", hasMedia: true, injuryTag: "low back" },
  { id: "e9", name: "Ankle Banded Dorsiflexion Drill", phase: "warmup_specific", pattern: "Mobility", hasMedia: false, injuryTag: "ankle" },
  { id: "e101", name: "Banded Anti Rotation Walk Outs", phase: "warmup_specific", pattern: "Rotation / Anti-Rotation", hasMedia: true },
  { id: "e58", name: "Banded Lateral Walks", phase: "warmup_specific", pattern: "Mobility", hasMedia: true, injuryTag: "hip" },
  { id: "e59", name: "Banded Hip Flexor Raises", phase: "warmup_specific", pattern: "Mobility", hasMedia: true, injuryTag: "hip" },
  { id: "e60", name: "Banded Neck Iso Holds", phase: "warmup_specific", pattern: "Mobility", hasMedia: true, injuryTag: "neck" },
  { id: "e61", name: "Scapular Push Ups", phase: "warmup_specific", pattern: "Horizontal Push", hasMedia: true, injuryTag: "shoulder" },
  { id: "e62", name: "Scapular Pull Ups", phase: "warmup_specific", pattern: "Vertical Pull", hasMedia: true, injuryTag: "shoulder" },
  { id: "e63", name: "Band External Rotation", phase: "warmup_specific", pattern: "Mobility", hasMedia: true, injuryTag: "shoulder" },

  // compound
  { id: "e10", name: "Back Squat", phase: "compound", pattern: "Squat", hasMedia: true },
  { id: "e11", name: "Front Squat", phase: "compound", pattern: "Squat", hasMedia: true },
  { id: "e12", name: "Trap Bar Deadlift", phase: "compound", pattern: "Hinge", hasMedia: true },
  { id: "e13", name: "Conventional Deadlift", phase: "compound", pattern: "Hinge", hasMedia: true },
  { id: "e14", name: "Romanian Deadlift", phase: "compound", pattern: "Hinge", hasMedia: true },
  { id: "e15", name: "Bench Press", phase: "compound", pattern: "Horizontal Push", hasMedia: true },
  { id: "e16", name: "Weighted Pull-Up", phase: "compound", pattern: "Vertical Pull", hasMedia: true },
  { id: "e17", name: "Dumbbell Bulgarian Split Squat", phase: "compound", pattern: "Lunge", hasMedia: true },
  { id: "e18", name: "Landmine Press", phase: "compound", pattern: "Vertical Push", hasMedia: false },
  { id: "e19", name: "Overhead Press", phase: "compound", pattern: "Vertical Push", hasMedia: true },
  { id: "e64", name: "Single Arm Dumbbell Row", phase: "compound", pattern: "Horizontal Pull", hasMedia: true },
  { id: "e65", name: "Barbell Floor Press", phase: "compound", pattern: "Horizontal Push", hasMedia: true },
  { id: "e66", name: "Barbell Shoulder Shrugs", phase: "compound", pattern: "Carry", hasMedia: true },
  { id: "e104", name: "Inverted Row", phase: "compound", pattern: "Horizontal Pull", hasMedia: true },
  { id: "e105", name: "Zercher Squat", phase: "compound", pattern: "Squat", hasMedia: true },
  { id: "e106", name: "Pin Squat", phase: "compound", pattern: "Squat", hasMedia: true },
  { id: "e82", name: "Safety Bar Squat", phase: "compound", pattern: "Squat", hasMedia: true },
  { id: "e83", name: "Barbell Row", phase: "compound", pattern: "Horizontal Pull", hasMedia: true },
  { id: "e84", name: "Barbell Shoulder Press", phase: "compound", pattern: "Vertical Push", hasMedia: true },
  { id: "e85", name: "Dumbbell Bench Press", phase: "compound", pattern: "Horizontal Push", hasMedia: true },

  // explosive / power
  { id: "e20", name: "Power Clean", phase: "explosive", pattern: "Hinge", hasMedia: true },
  { id: "e21", name: "Box Jump", phase: "explosive", pattern: "Jump / Plyo", hasMedia: false },
  { id: "e22", name: "Depth Jump", phase: "explosive", pattern: "Jump / Plyo", hasMedia: false },
  { id: "e23", name: "Broad Jump", phase: "explosive", pattern: "Jump / Plyo", hasMedia: true },
  { id: "e24", name: "Med Ball Rotational Slam", phase: "explosive", pattern: "Throw / Slam", hasMedia: true },
  { id: "e25", name: "Med Ball Chest Pass", phase: "explosive", pattern: "Throw / Slam", hasMedia: false },
  { id: "e26", name: "Med Ball Overhead Slam", phase: "explosive", pattern: "Throw / Slam", hasMedia: false },
  { id: "e27", name: "Landmine Rotational Throw", phase: "explosive", pattern: "Rotation / Anti-Rotation", hasMedia: false },
  { id: "e28", name: "Lateral Bound", phase: "explosive", pattern: "Jump / Plyo", hasMedia: false },
  { id: "e29", name: "Resisted Sprint Start (Band)", phase: "explosive", pattern: "Sprint / Locomotion", hasMedia: false },
  { id: "e30", name: "Heavy Bag Punch Combo (Power)", phase: "explosive", pattern: "Strike / Combat", hasMedia: false },
  { id: "e31", name: "Battle Rope Power Slam", phase: "explosive", pattern: "Strike / Combat", hasMedia: false },
  { id: "e67", name: "Sprints", phase: "explosive", pattern: "Sprint / Locomotion", hasMedia: true },
  { id: "e68", name: "Pogo Jumps", phase: "explosive", pattern: "Jump / Plyo", hasMedia: true },
  { id: "e69", name: "Standing Landmine Rotations", phase: "explosive", pattern: "Rotation / Anti-Rotation", hasMedia: true },
  { id: "e75", name: "Speed Skaters", phase: "explosive", pattern: "Jump / Plyo", hasMedia: true },
  { id: "e99", name: "Max Height Jumps", phase: "explosive", pattern: "Jump / Plyo", hasMedia: true },
  { id: "e100", name: "Single Leg Bounds", phase: "explosive", pattern: "Jump / Plyo", hasMedia: true },
  { id: "e76", name: "Alternating Jumping Split Lunges", phase: "explosive", pattern: "Jump / Plyo", hasMedia: true },
  { id: "e77", name: "Backwards Overhead Throws", phase: "explosive", pattern: "Throw / Slam", hasMedia: true },
  { id: "e78", name: "Ground Chest Pass", phase: "explosive", pattern: "Throw / Slam", hasMedia: true },
  { id: "e79", name: "Explosive Wall Chest Pass", phase: "explosive", pattern: "Throw / Slam", hasMedia: true },
  { id: "e86", name: "Dumbbell Single Arm Snatch", phase: "explosive", pattern: "Hinge", hasMedia: true },
  { id: "e87", name: "Barbell High Pull", phase: "explosive", pattern: "Hinge", hasMedia: true },
  { id: "e88", name: "Trap Bar Jumps", phase: "explosive", pattern: "Jump / Plyo", hasMedia: true },

  // hypertrophy
  { id: "e32", name: "Dumbbell Incline Press", phase: "hypertrophy", pattern: "Horizontal Push", hasMedia: false },
  { id: "e33", name: "Chest-Supported Row", phase: "hypertrophy", pattern: "Horizontal Pull", hasMedia: false },
  { id: "e34", name: "Lat Pulldown", phase: "hypertrophy", pattern: "Vertical Pull", hasMedia: true },
  { id: "e35", name: "Walking Lunge", phase: "hypertrophy", pattern: "Lunge", hasMedia: false },
  { id: "e36", name: "Leg Press", phase: "hypertrophy", pattern: "Squat", hasMedia: false },
  { id: "e37", name: "Landmine Single-Arm Row", phase: "hypertrophy", pattern: "Horizontal Pull", hasMedia: false },
  { id: "e38", name: "Cable Lateral Raise", phase: "hypertrophy", pattern: "Vertical Push", hasMedia: false },
  { id: "e39", name: "Hamstring Curl", phase: "hypertrophy", pattern: "Hinge", hasMedia: true },
  { id: "e40", name: "Farmer's Carry", phase: "hypertrophy", pattern: "Carry", hasMedia: false },
  { id: "e41", name: "Suitcase Carry", phase: "hypertrophy", pattern: "Carry", hasMedia: false },
  { id: "e42", name: "Cable Woodchopper", phase: "hypertrophy", pattern: "Rotation / Anti-Rotation", hasMedia: false },
  { id: "e70", name: "Dumbbell Oblique Side Bends", phase: "hypertrophy", pattern: "Core / Anti-Extension", hasMedia: true },
  { id: "e80", name: "Barbell Glute Bridge", phase: "hypertrophy", pattern: "Hinge", hasMedia: true },
  { id: "e81", name: "Seal Row", phase: "hypertrophy", pattern: "Horizontal Pull", hasMedia: true },
  { id: "e89", name: "Dumbbell Chest Fly", phase: "hypertrophy", pattern: "Horizontal Push", hasMedia: true },
  { id: "e90", name: "Seated Barbell Tricep Extension", phase: "hypertrophy", pattern: "Vertical Push", hasMedia: true },
  { id: "e91", name: "Barbell Tricep Extension (Lying)", phase: "hypertrophy", pattern: "Horizontal Push", hasMedia: true },
  { id: "e92", name: "Single Arm Dumbbell Tricep Extension", phase: "hypertrophy", pattern: "Vertical Push", hasMedia: true },
  { id: "e93", name: "Dumbbell Wrestler Cheat Curls", phase: "hypertrophy", pattern: "Vertical Pull", hasMedia: true },
  { id: "e94", name: "Dumbbell Rear Delt Flyes", phase: "hypertrophy", pattern: "Horizontal Pull", hasMedia: true },
  { id: "e95", name: "Dumbbell Lateral Raise", phase: "hypertrophy", pattern: "Vertical Push", hasMedia: true },
  { id: "e96", name: "Barbell Curl", phase: "hypertrophy", pattern: "Vertical Pull", hasMedia: true },
  { id: "e97", name: "Dumbbell Alternating Curl", phase: "hypertrophy", pattern: "Vertical Pull", hasMedia: true },

  // lactic
  { id: "e107", name: "Ski Erg Intervals", phase: "lactic", pattern: "Sprint / Locomotion", hasMedia: true },
  { id: "e103", name: "Battle Ropes", phase: "lactic", pattern: "Strike / Combat", hasMedia: true },
  { id: "e43", name: "Sled Push (Heavy)", phase: "lactic", pattern: "Sprint / Locomotion", hasMedia: true },
  { id: "e44", name: "Battle Rope Wave Intervals", phase: "lactic", pattern: "Strike / Combat", hasMedia: false },
  { id: "e45", name: "Bag Round (3min Combos)", phase: "lactic", pattern: "Strike / Combat", hasMedia: false },
  { id: "e46", name: "Assault Bike Sprint Intervals", phase: "lactic", pattern: "Sprint / Locomotion", hasMedia: false },
  { id: "e47", name: "Kettlebell Swing Complex", phase: "lactic", pattern: "Hinge", hasMedia: true },
  { id: "e48", name: "Burpee Broad Jump Combo", phase: "lactic", pattern: "Jump / Plyo", hasMedia: false },

  // aerobic
  { id: "e49", name: "Zone 2 Bike", phase: "aerobic", pattern: "Sprint / Locomotion", hasMedia: false },
  { id: "e50", name: "Incline Treadmill Walk", phase: "aerobic", pattern: "Sprint / Locomotion", hasMedia: false },
  { id: "e51", name: "Jump Rope (Steady State)", phase: "aerobic", pattern: "Jump / Plyo", hasMedia: false },
  { id: "e52", name: "Rowing Erg Steady State", phase: "aerobic", pattern: "Horizontal Pull", hasMedia: false },

  // cooldown
  { id: "e53", name: "Couch Stretch", phase: "cooldown", pattern: "Mobility", hasMedia: false },
  { id: "e54", name: "Pigeon Stretch", phase: "cooldown", pattern: "Mobility", hasMedia: true },
  { id: "e55", name: "Doorway Pec Stretch", phase: "cooldown", pattern: "Mobility", hasMedia: false },
  { id: "e56", name: "Box Breathing (Down-regulation)", phase: "cooldown", pattern: "Mobility", hasMedia: false },
  { id: "e57", name: "Foam Roll — Full Body", phase: "cooldown", pattern: "Mobility", hasMedia: false },
  { id: "e102", name: "90/90 Hip Stretch", phase: "cooldown", pattern: "Mobility", hasMedia: true },
  { id: "e71", name: "Cobra to Downward Dog", phase: "cooldown", pattern: "Mobility", hasMedia: true },
  { id: "e72", name: "The Erector Stretch", phase: "cooldown", pattern: "Mobility", hasMedia: true },
  { id: "e73", name: "Frog Stretch", phase: "cooldown", pattern: "Mobility", hasMedia: true },
  { id: "e74", name: "Butterfly Stretch", phase: "cooldown", pattern: "Mobility", hasMedia: true },
];

function exercisesByPhase(phaseKey) { return SEED_EXERCISES.filter(e => e.phase === phaseKey); }
function exercisesByPattern(pattern, excludeId) { return SEED_EXERCISES.filter(e => e.pattern === pattern && e.id !== excludeId); }

// ---------- unit conversion ----------
const kgToLb = kg => Math.round(kg * 2.20462 * 10) / 10;
const lbToKg = lb => Math.round((lb / 2.20462) * 10) / 10;
const cmToFtIn = cm => { const totalIn = cm / 2.54; const ft = Math.floor(totalIn / 12); const inch = Math.round(totalIn % 12); return { ft, inch }; };
const ftInToCm = (ft, inch) => Math.round((ft * 12 + inch) * 2.54);

// ---------- date helpers (workoutLogs store dates as YYYY-MM-DD) ----------
const todayISO = () => new Date().toISOString().slice(0, 10);
const formatLogDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso; // fallback for any legacy non-ISO strings
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// ---------- training volume recommendation ----------
function recommendVolume(daysPerWeek, experience) {
  const base = {
    "New to training": { 2: "2 full-body sessions", 3: "3 full-body sessions", 4: "Upper/Lower split", 5: "Upper/Lower + 1 conditioning", 6: "Push/Pull/Legs x2" },
    "Beginner": { 2: "2 full-body sessions", 3: "3 full-body sessions", 4: "Upper/Lower split", 5: "Upper/Lower + conditioning", 6: "Push/Pull/Legs x2" },
    "Intermediate": { 3: "3-day split, moderate volume", 4: "Upper/Lower split", 5: "Body-part split + conditioning", 6: "Push/Pull/Legs x2 + skill" },
    "Advanced": { 4: "Upper/Lower, high intensity", 5: "Body-part split, high volume", 6: "PPL x2 + sport-specific skill", 7: "PPL x2 + 1 active recovery" },
  };
  const tier = base[experience] || base["Beginner"];
  return tier[daysPerWeek] || tier[Object.keys(tier).map(Number).sort((a,b)=>a-b).find(d => d >= daysPerWeek)] || "Custom split recommended";
}

// ---------- seed roster / programs / messages (unchanged shape, updated content) ----------
const SEED_ATHLETES = [
  { id: "a1", name: "Jordan Reyes", sex: "male", sport: "MMA", streak: 12, lastActive: "Today", avatar: "JR", program: "p1", injuries: ["shoulder"], goals: ["Athletic Performance", "Build Muscle"], isFighter: true, weightKg: 79.4, heightCm: 180 },
  { id: "a2", name: "Maya Chen", sex: "female", sport: "General Fitness", streak: 5, lastActive: "Yesterday", avatar: "MC", program: "p2", injuries: [], goals: ["Build Muscle"], isFighter: false, weightKg: 61.2, heightCm: 165 },
  { id: "a3", name: "Devon Brooks", sex: "male", sport: "MMA", streak: 21, lastActive: "Today", avatar: "DB", program: "p1", injuries: ["knee"], goals: ["Athletic Performance"], isFighter: true, weightKg: 84.8, heightCm: 178 },
  { id: "a4", name: "Sofia Marsh", sex: "female", sport: "General Fitness", streak: 0, lastActive: "5 days ago", avatar: "SM", program: null, injuries: ["low back"], goals: ["Fat Loss", "Build Muscle"], isFighter: false, weightKg: 58.1, heightCm: 162 },
];

function buildDay(name, phaseSelections) {
  // phaseSelections: { phaseKey: [exerciseIds with sets/reps/rpe/rest] }
  const exercises = [];
  PHASES.forEach(p => {
    (phaseSelections[p.key] || []).forEach(x => exercises.push({ id: "x" + Math.random().toString(36).slice(2, 9), phase: p.key, ...x }));
  });
  return { id: "d" + Math.random().toString(36).slice(2, 9), name, exercises };
}

const SEED_PROGRAMS = [
  {
    id: "p1", name: "MMA Camp — Power & Conditioning", weeks: 6, assignedCount: 0, sport: "MMA",
    days: [
      buildDay("Day 1 — Power & Strike Conditioning", {
        warmup_general: [{ exerciseId: "e1", sets: 1, reps: "8/side", rpe: 4, rest: "—" }, { exerciseId: "e2", sets: 1, reps: "10/side", rpe: 4, rest: "—" }],
        warmup_specific: [{ exerciseId: "e6", sets: 2, reps: "10", rpe: 4, rest: "30s" }],
        compound: [{ exerciseId: "e10", sets: 4, reps: "4", rpe: 8, rest: "3min" }],
        explosive: [{ exerciseId: "e30", sets: 4, reps: "30s", rpe: 8, rest: "60s" }, { exerciseId: "e26", sets: 3, reps: "8", rpe: 7, rest: "60s" }],
        hypertrophy: [{ exerciseId: "e37", sets: 3, reps: "10/side", rpe: 7, rest: "60s" }],
        lactic: [{ exerciseId: "e45", sets: 3, reps: "3min", rpe: 9, rest: "60s" }],
        aerobic: [],
        cooldown: [{ exerciseId: "e55", sets: 1, reps: "60s/side", rpe: 2, rest: "—" }, { exerciseId: "e56", sets: 1, reps: "2min", rpe: 1, rest: "—" }],
      }),
      buildDay("Day 2 — Lower Power", {
        warmup_general: [{ exerciseId: "e4", sets: 1, reps: "8", rpe: 4, rest: "—" }, { exerciseId: "e5", sets: 1, reps: "8/side", rpe: 4, rest: "—" }],
        warmup_specific: [{ exerciseId: "e7", sets: 2, reps: "12", rpe: 4, rest: "30s" }],
        compound: [{ exerciseId: "e12", sets: 5, reps: "3", rpe: 8, rest: "3min" }],
        explosive: [{ exerciseId: "e21", sets: 4, reps: "5", rpe: 7, rest: "2min" }, { exerciseId: "e28", sets: 3, reps: "5/side", rpe: 7, rest: "90s" }],
        hypertrophy: [{ exerciseId: "e35", sets: 3, reps: "12/side", rpe: 7, rest: "60s" }],
        lactic: [{ exerciseId: "e43", sets: 4, reps: "20m", rpe: 8, rest: "90s" }],
        aerobic: [],
        cooldown: [{ exerciseId: "e54", sets: 1, reps: "60s/side", rpe: 2, rest: "—" }],
      }),
      buildDay("Day 3 — Conditioning & Aerobic Base", {
        warmup_general: [{ exerciseId: "e1", sets: 1, reps: "8/side", rpe: 4, rest: "—" }],
        warmup_specific: [],
        compound: [],
        explosive: [{ exerciseId: "e24", sets: 4, reps: "8/side", rpe: 7, rest: "60s" }],
        hypertrophy: [],
        lactic: [{ exerciseId: "e44", sets: 5, reps: "30s on/30s off", rpe: 9, rest: "—" }],
        aerobic: [{ exerciseId: "e49", sets: 1, reps: "25min", rpe: 5, rest: "—" }],
        cooldown: [{ exerciseId: "e57", sets: 1, reps: "5min", rpe: 1, rest: "—" }],
      }),
    ]
  },
  {
    id: "p2", name: "Build Muscle — Foundations", weeks: 4, assignedCount: 0, sport: "General Fitness",
    days: [
      buildDay("Day 1 — Upper Body", {
        warmup_general: [{ exerciseId: "e3", sets: 2, reps: "15", rpe: 3, rest: "—" }],
        warmup_specific: [], compound: [{ exerciseId: "e15", sets: 4, reps: "6", rpe: 7, rest: "2min" }],
        explosive: [], hypertrophy: [{ exerciseId: "e32", sets: 3, reps: "10", rpe: 7, rest: "75s" }, { exerciseId: "e33", sets: 3, reps: "12", rpe: 7, rest: "75s" }],
        lactic: [], aerobic: [], cooldown: [{ exerciseId: "e55", sets: 1, reps: "45s/side", rpe: 2, rest: "—" }],
      }),
    ]
  },
];

const SEED_MESSAGES = {
  a1: [
    { id: "m1", from: "coach", text: "Great work on the squat session — numbers looking strong.", time: "9:14 AM" },
    { id: "m2", from: "athlete", text: "Felt heavy today but got all reps in!", time: "9:20 AM" },
  ],
  a2: [{ id: "m3", from: "athlete", text: "Can we swap tomorrow's sprint work? Shin's a little sore.", time: "Yesterday" }],
  a3: [{ id: "m4", from: "coach", text: "21 day streak. That's elite consistency, Devon.", time: "2 days ago" }],
  a4: [],
};

const SEED_PROGRESS = [
  { date: "May 20", weightKg: 80.7, bodyFat: 14.2 },
  { date: "May 27", weightKg: 80.3, bodyFat: 13.9 },
  { date: "Jun 3", weightKg: 80.1, bodyFat: 13.6 },
  { date: "Jun 10", weightKg: 79.8, bodyFat: 13.4 },
  { date: "Jun 17", weightKg: 79.4, bodyFat: 13.1 },
];

const SEED_WORKOUT_LOGS = [
  { id: "l1", date: "2026-06-17", programDay: "Day 1 — Power & Strike Conditioning", duration: 58, mood: "strong" },
  { id: "l2", date: "2026-06-15", programDay: "Day 3 — Conditioning & Aerobic Base", duration: 64, mood: "good" },
  { id: "l3", date: "2026-06-13", programDay: "Day 2 — Lower Power", duration: 49, mood: "tough" },
];

const AI_SUGGESTED = [
  { id: "ai1", from: "ai", text: "Hey! I'm your AI training assistant. Ask me about form cues, recovery, or anything about your program.", time: "" },
];

const SEED_COMMUNITY = [
  { id: "c1", userId: "u_ext1", name: "Marcus T.", avatar: "MT", sport: "MMA", role: "athlete", text: "Just hit a new PR on trap bar deadlift — 405 for 3. The AI program has been dialing in my posterior chain work for the past 6 weeks. Anyone else seeing strength gains carry over to their wrestling?", likes: 14, liked: false, time: "2h ago", replies: [
    { id: "r1", userId: "u_ext2", name: "Coach Rivera", avatar: "CR", role: "coach", text: "Hip hinge strength absolutely transfers. Make sure you're pairing it with reactive work — single leg bounds, broad jumps.", time: "1h ago" },
    { id: "r2", userId: "u_ext3", name: "Dani K.", avatar: "DK", sport: "MMA", role: "athlete", text: "Yes! My shot is way more explosive since I added RDLs and trap bar work. Keeps going.", time: "45m ago" },
  ]},
  { id: "c2", userId: "u_ext4", name: "Sofia L.", avatar: "SL", sport: "General Fitness", role: "athlete", text: "Three months on the self-guided program and down 18lbs. Never thought I'd actually stick to something without a coach pushing me but the weekly accountability tracker is keeping me honest 💪", likes: 31, liked: false, time: "5h ago", replies: [
    { id: "r3", userId: "u_ext5", name: "Priya M.", avatar: "PM", sport: "General Fitness", role: "athlete", text: "That's incredible!! What's your split looking like right now?", time: "4h ago" },
  ]},
  { id: "c3", userId: "u_ext6", name: "Coach Kim", avatar: "CK", role: "coach", text: "Quick tip for anyone doing power cleans: if the bar is swinging away from your body in the second pull, you're losing your lat engagement. Think 'elbows high and outside' and keep the bar dragging up your thighs. Cuts the swing immediately.", likes: 22, liked: false, time: "8h ago", replies: [] },
  { id: "c4", userId: "u_ext7", name: "Ray J.", avatar: "RJ", sport: "MMA", role: "athlete", text: "6 weeks out from my first amateur MMA fight. Nervously excited. The AI built me a full camp program with the competition date locked in — it actually adjusted the block structure based on weeks out. Anyone else used this for fight camp?", likes: 19, liked: false, time: "1d ago", replies: [
    { id: "r4", userId: "u_ext8", name: "Coach Rivera", avatar: "CR", role: "coach", text: "Good luck Ray! Taper week is key — don't skip it no matter how good you feel.", time: "22h ago" },
    { id: "r5", userId: "u_ext9", name: "Marcus T.", avatar: "MT", sport: "MMA", role: "athlete", text: "Let us know how it goes. You've got this 🔥", time: "20h ago" },
  ]},
  { id: "c5", userId: "u_ext10", name: "Jasmine W.", avatar: "JW", sport: "General Fitness", role: "athlete", text: "Quick question — what's everyone eating post-workout? I've been doing a protein shake but wondering if whole food is better for recovery at this training volume.", likes: 8, liked: false, time: "2d ago", replies: [
    { id: "r6", userId: "u_ext11", name: "Coach Kim", avatar: "CK", role: "coach", text: "Either works. What matters most is getting 30-50g protein within 2hrs. Whole food is great if your digestion handles it post-training.", time: "1d ago" },
  ]},
];



// ---------- small primitives ----------
function PlateBadge({ value, label, accent = C.orange }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-full border-4 px-1 shrink-0"
      style={{ borderColor: accent, width: 78, height: 78, background: C.panel }}>
      <span className="font-mono font-bold text-base leading-none text-center" style={{ color: C.text }}>{value}</span>
      <span className="text-[8px] uppercase tracking-wider mt-1" style={{ color: C.sub }}>{label}</span>
    </div>
  );
}

function ChalkDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-6">
      <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${C.border}, transparent)` }} />
      {label && <span className="text-xs uppercase tracking-[0.2em] font-semibold shrink-0" style={{ color: C.sub, fontFamily: "Inter" }}>{label}</span>}
      <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${C.border}, transparent)` }} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent = C.orange }) {
  return (
    <div className="rounded-xl p-3.5 flex items-center gap-2.5 min-w-0" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="rounded-lg p-2 shrink-0" style={{ background: `${accent}22` }}>
        <Icon size={18} style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <div className="font-mono font-bold text-xl leading-tight truncate" style={{ color: C.text }}>{value}</div>
        <div className="text-[10px] uppercase tracking-wide truncate" style={{ color: C.sub }}>{label}</div>
        {sub && <div className="text-[10px] mt-0.5 truncate" style={{ color: accent }}>{sub}</div>}
      </div>
    </div>
  );
}

function Avatar({ initials, size = 40, accent = C.orange, photoUrl }) {
  if (photoUrl) {
    return (
      <div className="rounded-full overflow-hidden shrink-0" style={{ width: size, height: size }}>
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, background: `${accent}22`, color: accent, fontFamily: "Inter", fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

function EditableAvatar({ initials, size = 72, accent = C.orange, photoUrl, onChange }) {
  const inputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="relative inline-block">
      <Avatar initials={initials} size={size} accent={accent} photoUrl={photoUrl} />
      <button onClick={() => inputRef.current?.click()}
        className="absolute bottom-0 right-0 rounded-full flex items-center justify-center"
        style={{ width: size * 0.34, height: size * 0.34, background: C.orange, border: `2px solid ${C.bg}` }}>
        <ImageIcon size={size * 0.17} style={{ color: "#fff" }} />
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", className = "", icon: Icon, type = "button", disabled }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-full font-semibold text-sm px-4 py-2.5 transition-all active:scale-[0.98] shrink-0";
  const variants = {
    primary: { background: C.orange, color: "#FFFFFF" },
    secondary: { background: C.panel, color: C.text, border: `1px solid ${C.border}` },
    ghost: { background: "transparent", color: C.sub },
    danger: { background: "#3A1414", color: C.red },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${className}`}
      style={{ ...variants[variant], opacity: disabled ? 0.5 : 1 }}>
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

function Pill({ children, active, onClick, accent = C.orange }) {
  return (
    <button onClick={onClick} className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0"
      style={{ background: active ? accent : C.panel, color: active ? C.bg : C.sub, border: `1px solid ${active ? accent : C.border}` }}>
      {children}
    </button>
  );
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "#000000aa" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className={`w-full ${wide ? "sm:max-w-lg" : "sm:max-w-md"} rounded-t-2xl sm:rounded-2xl max-h-[88vh] flex flex-col`}
        style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ background: C.panel, borderBottom: `1px solid ${C.border}` }}>
          <h3 className="font-semibold text-lg" style={{ fontFamily: "Inter", color: C.text }}>{title}</h3>
          <button onClick={onClose} style={{ color: C.sub }}><X size={20} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.sub }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  background: C.bg, border: `1px solid ${C.border}`, color: C.text,
  borderRadius: 8, padding: "10px 12px", width: "100%", fontSize: 14, outline: "none"
};

function UnitToggle({ value, options, onChange }) {
  return (
    <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: `1px solid ${C.border}` }}>
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)} className="px-3 py-1.5 text-xs font-mono font-semibold"
          style={{ background: value === opt ? C.orange : C.panel, color: value === opt ? C.bg : C.sub }}>
          {opt}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// HEIGHT DIAL (scrollable ft/in or cm picker)
// ============================================================
function HeightDial({ unit, valueCm, onChange }) {
  // unit: 'imperial' shows ft/in wheels, 'metric' shows cm wheel
  const ftRange = Array.from({ length: 5 }, (_, i) => i + 3); // 3-7 ft
  const inRange = Array.from({ length: 12 }, (_, i) => i);
  const cmRange = Array.from({ length: 121 }, (_, i) => i + 120); // 120-240cm

  const { ft, inch } = cmToFtIn(valueCm);

  const ItemList = ({ items, selected, onSelect, suffix }) => {
    const ref = useRef(null);
    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const idx = items.indexOf(selected);
      if (idx >= 0) el.scrollTop = idx * 40;
    }, []);
    return (
      <div ref={ref} className="h-40 overflow-y-auto snap-y snap-mandatory rounded-lg" style={{ background: C.bg, border: `1px solid ${C.border}` }}
        onScroll={e => {
          const idx = Math.round(e.target.scrollTop / 40);
          const val = items[Math.max(0, Math.min(items.length - 1, idx))];
          if (val !== undefined && val !== selected) onSelect(val);
        }}>
        <div style={{ height: 60 }} />
        {items.map(v => (
          <div key={v} className="h-10 flex items-center justify-center snap-center font-mono font-bold text-lg"
            style={{ color: v === selected ? C.orange : C.faint }}>
            {v}{suffix}
          </div>
        ))}
        <div style={{ height: 60 }} />
      </div>
    );
  };

  if (unit === "imperial") {
    return (
      <div>
        <div className="flex items-center justify-center gap-4 mb-2 relative">
          <div className="flex-1 relative">
            <ItemList items={ftRange} selected={ft} onSelect={v => onChange(ftInToCm(v, inch))} suffix=" ft" />
          </div>
          <div className="flex-1 relative">
            <ItemList items={inRange} selected={inch} onSelect={v => onChange(ftInToCm(ft, v))} suffix=" in" />
          </div>
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-10 pointer-events-none rounded-lg" style={{ border: `2px solid ${C.orange}66` }} />
        </div>
        <div className="text-center font-mono font-bold text-2xl" style={{ color: C.text }}>{ft} ft {inch} in</div>
      </div>
    );
  }
  return (
    <div>
      <div className="relative">
        <ItemList items={cmRange} selected={valueCm} onSelect={onChange} suffix=" cm" />
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-10 pointer-events-none rounded-lg" style={{ border: `2px solid ${C.orange}66` }} />
      </div>
      <div className="text-center font-mono font-bold text-2xl mt-2" style={{ color: C.text }}>{valueCm} cm</div>
    </div>
  );
}

// ============================================================
// ONBOARDING
// ============================================================

const SPORTS = ["MMA", "General Fitness", "New to training (weightlifting focus)"];
const GOALS = ["Weight Loss", "Build Muscle", "Strength", "Explosive Training", "Conditioning / Endurance", "Flexibility", "Injury Recovery"];
const INJURY_AREAS = ["None currently", "Shoulder", "Knee", "Low back", "Ankle", "Hip", "Elbow / Wrist"];

const DEFAULT_TEST_ATHLETE = {
  sex: "Male",
  "🥊 Sport / Focus": "MMA",
  isFighter: true,
  discipline: "Muay Thai / Wrestling",
  experience: "Intermediate",
  goals: ["Athletic Performance", "Build Muscle"],
  goalNotes: "Test profile — details don't matter",
  timeframe: "Off-season, no fight booked",
  fightDate: null,
  injuries: ["None currently"],
  injuryNotes: "",
  heightCm: 178,
  weightLb: 175,
  weightUnit: "lb",
  heightUnit: "imperial",
  daysPerWeek: 4,
  equipment: ["Full gym access"],
};

// Skip needs a real, unique identity each time — otherwise signUp() fails silently
// (no name/email/password = no real Supabase account = no community access, no login).
function buildSkipTestAthlete() {
  const id = Date.now().toString(36);
  return {
    ...DEFAULT_TEST_ATHLETE,
    name: `Test Athlete ${id.slice(-4)}`,
    email: `test.${id}@trainedbythebest.dev`,
    password: `TestPass${id}!`,
  };
}

function LoginScreen({ onLogin, onSwitchToSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    const err = await onLogin(email, password);
    setLoading(false);
    if (err) setError(err);
  };

  const forgotPassword = async () => {
    if (!/\S+@\S+\.\S+/.test(email)) { setError("Enter your email above first, then tap 'Forgot password?'"); return; }
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) setError(error.message);
    else setResetSent(true);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10" style={{ background: C.bg }}>
      <Dumbbell size={40} style={{ color: C.orange }} />
      <h1 className="mt-4 text-3xl tracking-tight text-center" style={{ fontFamily: "Inter", fontWeight: 800, color: C.text }}>WELCOME BACK</h1>

      <div className="mt-10 w-full max-w-sm">
        <Field label="Email">
          <input type="email" autoFocus placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Password">
          <div className="relative">
            <input type={showPassword ? "text" : "password"} placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, paddingRight: 44 }} onKeyDown={e => e.key === "Enter" && submit()} />
            <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff size={18} style={{ color: C.sub }} /> : <Eye size={18} style={{ color: C.sub }} />}
            </button>
          </div>
        </Field>

        {error && <p className="text-xs mb-3" style={{ color: C.red }}>{error}</p>}
        {resetSent && <p className="text-xs mb-3" style={{ color: C.olive }}>Password reset email sent — check your inbox.</p>}

        <Btn className="w-full mt-2" onClick={submit} disabled={loading || !email || !password}>
          {loading ? "Logging in..." : "Log In"}
        </Btn>

        <button onClick={forgotPassword} className="w-full text-center text-sm mt-4" style={{ color: C.sub }}>
          Forgot password?
        </button>
        <button onClick={onSwitchToSignup} className="w-full text-center text-sm mt-3" style={{ color: C.sub }}>
          New here? <span style={{ color: C.orange, fontWeight: 600 }}>Create an account</span>
        </button>
      </div>
    </div>
  );
}

function Onboarding({ onComplete, onSwitchToLogin }) {
  const [role, setRole] = useState(null);
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    weightUnit: "lb", heightUnit: "imperial", heightCm: 178, weightLb: null,
  });
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const [skipLoading, setSkipLoading] = useState(false);
  const [skipError, setSkipError] = useState(null);

  const coachSteps = ["👤 Your Name", "🏅 Background", "📩 Invite Athletes", "📸 Profile Photo", "🔐 Create Account"];
  const athleteSteps = [
    "👤 Your Name", "💪 Training Experience", "🧬 Sex", "🥊 Sport / Focus", "🥋 Sport Details", "🎯 Goals", "🔍 Goal Depth",
    "🩹 Injuries", "📏 Height", "⚖️ Weight", "📅 Training Schedule", "🏋️ Equipment", "📸 Profile Photo", "🔐 Create Account"
  ];
  const coachedAthleteSteps = ["👤 Your Name", "🔑 Coach Invite Code", ...athleteSteps.slice(1)];
  const steps = role === "coach" ? coachSteps : role === "athlete_coached" ? coachedAthleteSteps : athleteSteps;
  const isLast = step === steps.length - 1;
  const stepName = steps[step];

  // skip "🥋 Sport Details" if not MMA (no fighter-specific follow-up needed)
  const shouldSkip = (name) => {
    if (role !== "athlete" && role !== "athlete_coached") return false;
    if (name === "🥋 Sport Details" && (data["🥊 Sport / Focus"] !== "MMA" || data["🥊 Sport / Focus"] === "New to training (weightlifting focus)")) return true;
    return false;
  };

  const advance = (dir) => {
    let next = step + dir;
    while (next >= 0 && next < steps.length && shouldSkip(steps[next])) next += dir;
    if (next < 0) { setRole(null); setStep(0); return; }
    setStep(Math.max(0, Math.min(steps.length - 1, next)));
  };

  // returns true if the current step has the information it needs to proceed
  const isStepComplete = () => {
    if (role === "coach") {
      switch (stepName) {
        case "👤 Your Name": return !!(data.name || "").trim();
        case "🏅 Background": return !!data["🏅 Background"];
        case "⚡ Specialties": return true;
        case "🎯 Coaching Style": return true;
        case "📩 Invite Athletes": return true; // optional by design
        case "📸 Profile Photo": return true; // optional by design
        case "🔐 Create Account": return /\S+@\S+\.\S+/.test(data.email || "") && (data.password || "").length >= 6;
        default: return true;
      }
    }
    switch (stepName) {
      case "👤 Your Name": return !!(data.name || "").trim();
      case "💪 Training Experience": return !!data.experience;
      case "🔑 Coach Invite Code": return (data.inviteCode || "").length === 6;
      case "🧬 Sex": return !!data.sex;
      case "🥊 Sport / Focus": return !!data["🥊 Sport / Focus"];
      case "🥋 Sport Details": return data.isFighter !== undefined && data.isFighter !== null;
      case "🎯 Goals": return (data.goals || []).length > 0;
      case "🔍 Goal Depth": return !!data.timeframe && (data.timeframe !== "Competition date" || !!data.fightDate);
      case "🩹 Injuries": return (data.injuries || []).length > 0;
      case "📏 Height": return !!data.heightCm;
      case "⚖️ Weight": return !!data.weightLb && data.weightLb > 0;
      case "📅 Training Schedule": return !!data.daysPerWeek;
      case "🏋️ Equipment": return (data.equipment || []).length > 0;
      case "📸 Profile Photo": return true; // optional by design
      case "🔐 Create Account": return /\S+@\S+\.\S+/.test(data.email || "") && (data.password || "").length >= 6;
      default: return true;
    }
  };
  const canProceed = isStepComplete();

  const handleNext = () => {
    if (!canProceed) return;
    if (isLast) {
      onComplete(role, data).then(err => { if (err) setData(d => ({ ...d, signupError: err })); });
    } else {
      advance(1);
    }
  };

  // Window-level listener (not just onKeyDown on the container) so Enter works
  // even on steps built from tap-to-select buttons, where nothing has real
  // keyboard focus — especially on mobile browsers. These hooks must run on
  // EVERY render (before any early return) or React throws error #310.
  const handleNextRef = useRef(handleNext);
  useEffect(() => { handleNextRef.current = handleNext; });
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        handleNextRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!role) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10" style={{ background: C.bg }}>
        <Dumbbell size={40} style={{ color: C.orange }} />
        <h1 className="mt-4 text-4xl tracking-tight text-center" style={{ fontFamily: "Inter", fontWeight: 800, color: C.text }}>TRAINEDBEST</h1>
        <p className="mt-2 text-sm" style={{ color: C.sub }}>Beyourownhero</p>

        <div className="mt-12 w-full max-w-sm space-y-3">
          <button onClick={() => setRole("coach")}
            className="w-full text-left rounded-xl p-5 transition-transform active:scale-[0.98]"
            style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2.5 shrink-0" style={{ background: `${C.orange}22` }}><Shield size={22} style={{ color: C.orange }} /></div>
              <div className="min-w-0">
                <div className="font-semibold" style={{ color: C.text, fontFamily: "Inter" }}>I'M A COACH</div>
                <div className="text-xs mt-0.5" style={{ color: C.sub }}>Build programs, track athletes, message your roster</div>
              </div>
            </div>
          </button>
          <button onClick={() => setRole("athlete_coached")}
            className="w-full text-left rounded-xl p-5 transition-transform active:scale-[0.98]"
            style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2.5 shrink-0" style={{ background: `${C.steel}55` }}><Users size={22} style={{ color: C.blue }} /></div>
              <div className="min-w-0">
                <div className="font-semibold" style={{ color: C.text, fontFamily: "Inter" }}>I HAVE A COACH</div>
                <div className="text-xs mt-0.5" style={{ color: C.sub }}>Join your coach's roster with an invite code</div>
              </div>
            </div>
          </button>
          <button onClick={() => setRole("athlete")}
            className="w-full text-left rounded-xl p-5 transition-transform active:scale-[0.98]"
            style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2.5 shrink-0" style={{ background: `${C.olive}22` }}><Zap size={22} style={{ color: C.olive }} /></div>
              <div className="min-w-0">
                <div className="font-semibold" style={{ color: C.text, fontFamily: "Inter" }}>SELF-GUIDED ATHLETE</div>
                <div className="text-xs mt-0.5" style={{ color: C.sub }}>Get an AI-generated program instantly, train on your own</div>
              </div>
            </div>
          </button>
        </div>

        <button onClick={async () => {
          setSkipLoading(true); setSkipError(null);
          const err = await onComplete("athlete", buildSkipTestAthlete());
          setSkipLoading(false);
          if (err) setSkipError(err);
        }}
          disabled={skipLoading}
          className="mt-8 text-xs font-semibold px-4 py-2 rounded-full"
          style={{ color: C.faint, border: `1px dashed ${C.border}` }}>
          {skipLoading ? "Setting up..." : "⚡ Skip (dev/test — generated profile)"}
        </button>
        {skipError && <p className="text-xs mt-2 text-center" style={{ color: C.red }}>{skipError}</p>}

        <button onClick={onSwitchToLogin} className="mt-4 text-sm" style={{ color: C.sub }}>
          Already have an account? <span style={{ color: C.orange, fontWeight: 600 }}>Log in</span>
        </button>

        <div className="mt-8 text-[10px]" style={{ color: C.faint }}>build {BUILD_TAG}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bg }}>
      <div className="px-6 pt-8 pb-4 shrink-0">
        <div className="flex items-center gap-1.5 mb-1">
          {steps.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? C.orange : C.border }} />
          ))}
        </div>
        <div className="text-xs uppercase tracking-wider mt-2" style={{ color: C.sub }}>Step {step + 1} of {steps.length}</div>
      </div>

      <div className="flex-1 px-6 overflow-y-auto pb-4">
        <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: "Inter", color: C.text }}>{stepName}</h2>
        <OnboardingStepBody role={role} stepName={stepName} data={data} setData={setData} />
      </div>

      <div className="px-6 pb-8 pt-4 flex gap-3 shrink-0" style={{ borderTop: `1px solid ${C.border}` }}>
        <Btn variant="secondary" onClick={() => advance(-1)} icon={ChevronLeft}>Back</Btn>
        <Btn className="flex-1" disabled={!canProceed} onClick={handleNext}>
          {isLast ? "Finish Setup" : "Continue"}
        </Btn>
      </div>
    </div>
  );
}

function OnboardingStepBody({ role, stepName, data, setData }) {
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  // Invite code step — only appears for athlete_coached role
  if (stepName === "🔑 Coach Invite Code") {
    const code = data.inviteCode || "";
    return (
      <div>
        <p className="text-sm mb-6" style={{ color: C.sub }}>Your coach will share a 6-digit invite code with you. Enter it below to link your account to their roster.</p>
        <div className="relative mb-3">
          <input
            type="text"
            maxLength={6}
            autoFocus
            placeholder="ENTER CODE"
            value={code}
            onChange={e => set("inviteCode", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            style={{
              background: C.panel,
              border: `2px solid ${code.length === 6 ? C.olive : C.orange}`,
              color: C.text,
              borderRadius: 16,
              padding: "20px 24px",
              width: "100%",
              fontSize: 32,
              fontFamily: "JetBrains Mono",
              fontWeight: 700,
              textAlign: "center",
              letterSpacing: "0.35em",
              outline: "none",
              caretColor: C.orange,
            }}
          />
          {code.length === 6 && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <CheckCircle2 size={22} style={{ color: C.olive }} />
            </div>
          )}
        </div>
        <div className="flex justify-center gap-2 mb-6">
          {Array.from({length: 6}).map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full transition-all"
              style={{ background: i < code.length ? C.orange : C.border, transform: i < code.length ? "scale(1.3)" : "scale(1)" }} />
          ))}
        </div>
        <p className="text-xs text-center" style={{ color: C.faint }}>Don't have a code? Ask your coach to send one from their dashboard.</p>
      </div>
    );
  }

  // Name step — shared across all roles, asked early for personalization
  if (stepName === "👤 Your Name") {
    return (
      <div>
        <p className="text-sm mb-6" style={{ color: C.sub }}>What should we call you? This is how you'll appear to {role === "coach" ? "your athletes" : "your coach and the community"}.</p>
        <input
          type="text"
          autoFocus
          placeholder="Your name"
          value={data.name || ""}
          onChange={e => set("name", e.target.value)}
          style={{ ...inputStyle, fontSize: 20, padding: "16px" }}
        />
      </div>
    );
  }

  // Photo step — shared across all roles, optional, placed at the end after investment is built
  if (stepName === "📸 Profile Photo") {
    return (
      <div className="flex flex-col items-center pt-4">
        <p className="text-sm mb-6 text-center" style={{ color: C.sub }}>Add a profile photo so people recognize you. You can always add or change this later — totally optional.</p>
        <EditableAvatar
          initials={(data.name || "?").trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?"}
          size={120}
          photoUrl={data.photoUrl}
          onChange={url => set("photoUrl", url)}
        />
        {data.photoUrl && (
          <button onClick={() => set("photoUrl", null)} className="mt-4 text-xs font-semibold" style={{ color: C.sub }}>Remove photo</button>
        )}
      </div>
    );
  }

  // Account step — shared, last step, creates the real login credentials
  if (stepName === "🔐 Create Account") {
    return (
      <div>
        <p className="text-sm mb-6" style={{ color: C.sub }}>Create your login so you can come back anytime — this is also how you'll reset your password if you forget it.</p>
        <Field label="Email">
          <input type="email" autoFocus placeholder="you@example.com" value={data.email || ""} onChange={e => set("email", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Password">
          <div className="relative">
            <input type={data.showPassword ? "text" : "password"} placeholder="At least 6 characters" value={data.password || ""} onChange={e => set("password", e.target.value)} style={{ ...inputStyle, paddingRight: 44 }} />
            <button type="button" onClick={() => set("showPassword", !data.showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label={data.showPassword ? "Hide password" : "Show password"}>
              {data.showPassword ? <EyeOff size={18} style={{ color: C.sub }} /> : <Eye size={18} style={{ color: C.sub }} />}
            </button>
          </div>
        </Field>
        {data.signupError && (
          <p className="text-xs mt-2" style={{ color: C.red }}>{data.signupError}</p>
        )}
      </div>
    );
  }

  if (role === "coach") {
    const opts = {
      "🏅 Background": ["0-2 years coaching", "3-5 years coaching", "6-10 years coaching", "10+ years coaching"],
      "⚡ Specialties": ["Strength & Power", "MMA / Combat Performance", "Olympic Lifting", "Return-to-Play", "Conditioning", "General Fitness Coaching"],
      "🎯 Coaching Style": ["High intensity / direct", "Technical / cue-heavy", "Collaborative / athlete-led", "Data-driven"],
    };
    if (stepName === "📩 Invite Athletes") {
      return (
        <div>
          <p className="text-sm mb-4" style={{ color: C.sub }}>Add athlete emails now, or skip and invite later from your dashboard.</p>
          <Field label="Athlete email"><input style={inputStyle} placeholder="athlete@email.com" /></Field>
          <Btn variant="secondary" icon={Plus}>Add another</Btn>
        </div>
      );
    }
    const isMulti = stepName === "⚡ Specialties";
    const list = opts[stepName] || [];
    const current = data[stepName] || (isMulti ? [] : null);
    return (
      <div className="grid grid-cols-1 gap-2.5">
        {list.map(opt => {
          const isActive = isMulti ? current.includes(opt) : current === opt;
          return (
            <button key={opt} onClick={() => isMulti ? set(stepName, current.includes(opt) ? current.filter(x => x !== opt) : [...current, opt]) : set(stepName, opt)}
              className="text-left rounded-lg px-4 py-3.5 flex items-center justify-between transition-colors"
              style={{ background: isActive ? `${C.orange}18` : C.panel, border: `1px solid ${isActive ? C.orange : C.border}` }}>
              <span style={{ color: isActive ? C.orange : C.text, fontWeight: isActive ? 600 : 400 }}>{opt}</span>
              {isActive && <Check size={16} style={{ color: C.orange }} />}
            </button>
          );
        })}
      </div>
    );
  }

  // ATHLETE STEPS
  switch (stepName) {
    case "💪 Training Experience": {
      const list = ["New to training", "Beginner (under 1 year)", "Intermediate (1-3 years)", "Advanced (3+ years)"];
      return (
        <div className="grid grid-cols-1 gap-2.5">
          {list.map(opt => (
            <button key={opt} onClick={() => set("experience", opt)} className="text-left rounded-lg px-4 py-3.5 flex items-center justify-between"
              style={{ background: data.experience === opt ? `${C.orange}18` : C.panel, border: `1px solid ${data.experience === opt ? C.orange : C.border}` }}>
              <span style={{ color: data.experience === opt ? C.orange : C.text, fontWeight: data.experience === opt ? 600 : 400 }}>{opt}</span>
              {data.experience === opt && <Check size={16} style={{ color: C.orange }} />}
            </button>
          ))}
        </div>
      );
    }
    case "🧬 Sex": {
      return (
        <div className="grid grid-cols-2 gap-3">
          {["Male", "Female"].map(opt => (
            <button key={opt} onClick={() => set("sex", opt)} className="rounded-xl p-5 text-center"
              style={{ background: data.sex === opt ? `${C.orange}18` : C.panel, border: `1px solid ${data.sex === opt ? C.orange : C.border}` }}>
              <span className="font-semibold" style={{ color: data.sex === opt ? C.orange : C.text, fontFamily: "Inter" }}>{opt.toUpperCase()}</span>
            </button>
          ))}
        </div>
      );
    }
    case "🥊 Sport / Focus": {
      return (
        <div className="grid grid-cols-1 gap-2.5">
          {SPORTS.map(opt => (
            <button key={opt} onClick={() => set("🥊 Sport / Focus", opt)} className="text-left rounded-lg px-4 py-3.5 flex items-center justify-between"
              style={{ background: data["🥊 Sport / Focus"] === opt ? `${C.orange}18` : C.panel, border: `1px solid ${data["🥊 Sport / Focus"] === opt ? C.orange : C.border}` }}>
              <span style={{ color: data["🥊 Sport / Focus"] === opt ? C.orange : C.text, fontWeight: data["🥊 Sport / Focus"] === opt ? 600 : 400 }}>{opt}</span>
              {data["🥊 Sport / Focus"] === opt && <Check size={16} style={{ color: C.orange }} />}
            </button>
          ))}
        </div>
      );
    }
    case "🥋 Sport Details": {
      return (
        <div>
          <Field label="Are you a fighter (competing) or training for fitness/skill?">
            <div className="grid grid-cols-2 gap-3">
              {["Competing fighter", "Training only"].map(opt => (
                <button key={opt} onClick={() => set("isFighter", opt === "Competing fighter")}
                  className="rounded-lg p-3.5 text-center text-sm font-medium"
                  style={{ background: data.isFighter === (opt === "Competing fighter") ? `${C.orange}18` : C.panel, border: `1px solid ${data.isFighter === (opt === "Competing fighter") ? C.orange : C.border}`, color: data.isFighter === (opt === "Competing fighter") ? C.orange : C.text }}>
                  {opt}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Discipline (optional)">
            <input style={inputStyle} placeholder="e.g. Muay Thai, BJJ, MMA, Boxing" value={data.discipline || ""} onChange={e => set("discipline", e.target.value)} />
          </Field>
        </div>
      );
    }
    case "🎯 Goals": {
      const current = data.goals || [];
      return (
        <div>
          <p className="text-xs mb-3" style={{ color: C.sub }}>Select all that apply. Multiple goals will combine into a condensed training approach.</p>
          <div className="grid grid-cols-1 gap-2.5">
            {GOALS.map(opt => {
              const isActive = current.includes(opt);
              return (
                <button key={opt} onClick={() => set("goals", isActive ? current.filter(x => x !== opt) : [...current, opt])}
                  className="text-left rounded-lg px-4 py-3.5 flex items-center justify-between"
                  style={{ background: isActive ? `${C.orange}18` : C.panel, border: `1px solid ${isActive ? C.orange : C.border}` }}>
                  <span style={{ color: isActive ? C.orange : C.text, fontWeight: isActive ? 600 : 400 }}>{opt}</span>
                  {isActive && <Check size={16} style={{ color: C.orange }} />}
                </button>
              );
            })}
          </div>
          {current.length > 1 && (
            <div className="mt-3 rounded-lg p-3 flex items-start gap-2" style={{ background: `${C.blue}18`, border: `1px solid ${C.blue}55` }}>
              <Sparkles size={15} style={{ color: C.blue }} className="mt-0.5 shrink-0" />
              <span className="text-xs" style={{ color: C.blue }}>Condensed model: we'll blend {current.join(" + ")} into one program instead of separate plans.</span>
            </div>
          )}
        </div>
      );
    }
    case "🔍 Goal Depth": {
      const weeksOut = data.fightDate ? Math.max(1, Math.round((new Date(data.fightDate) - new Date()) / (1000 * 60 * 60 * 24 * 7))) : null;
      return (
        <div>
          <Field label="What's holding you back right now?">
            <p className="text-xs mb-2.5" style={{ color: C.sub }}>Select all that apply.</p>
            <div className="grid grid-cols-1 gap-2">
              {["Lack of structured program", "Lack of support / accountability", "Injuries or physical limitations", "Lack of information / knowledge", "Time constraints", "Plateaued on current routine", "Recovery / fatigue issues", "Nutrition gaps", "Mental blocks / motivation"].map(opt => {
                const isActive = (data.barriers || []).includes(opt);
                return (
                  <button key={opt} onClick={() => set("barriers", isActive ? (data.barriers || []).filter(x => x !== opt) : [...(data.barriers || []), opt])}
                    className="text-left rounded-lg px-3.5 py-3 flex items-center justify-between"
                    style={{ background: isActive ? `${C.orange}18` : C.panel, border: `1px solid ${isActive ? C.orange : C.border}` }}>
                    <span className="text-sm" style={{ color: isActive ? C.orange : C.text, fontWeight: isActive ? 600 : 400 }}>{opt}</span>
                    {isActive && <Check size={15} style={{ color: C.orange }} />}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Target timeframe">
            <div className="grid grid-cols-2 gap-2.5">
              {["N/A — no event", "4-6 weeks", "8-12 weeks", "Competition date"].map(opt => (
                <button key={opt} onClick={() => { set("timeframe", opt); if (opt !== "Competition date") set("fightDate", null); }}
                  className="rounded-lg p-3 text-center text-sm"
                  style={{ background: data.timeframe === opt ? `${C.orange}18` : C.panel, border: `1px solid ${data.timeframe === opt ? C.orange : C.border}`, color: data.timeframe === opt ? C.orange : C.text }}>
                  {opt}
                </button>
              ))}
            </div>
          </Field>
          {data.timeframe === "Competition date" && (
            <Field label="Pick your competition date">
              <input type="date" style={{ ...inputStyle, colorScheme: "dark" }} min={new Date().toISOString().slice(0, 10)}
                value={data.fightDate || ""} onChange={e => set("fightDate", e.target.value)} />
              {weeksOut !== null && weeksOut > 0 && (
                <div className="mt-3 rounded-lg p-3.5 flex items-start gap-2.5" style={{ background: `${C.orange}18`, border: `1px solid ${C.orange}55` }}>
                  <Target size={15} style={{ color: C.orange }} className="mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold" style={{ color: C.orange }}>{weeksOut} weeks out</div>
                    <div className="text-xs mt-0.5" style={{ color: C.text }}>
                      {weeksOut >= 12 ? "Full periodized camp — enough time for accumulation, intensification and peak phases." :
                        weeksOut >= 8 ? "Standard 8-week camp — we'll compress into intensification and a short peak." :
                        weeksOut >= 6 ? "Short camp — direct prep focus, minimal volume, max specificity." :
                        "Very short turnaround — we'll keep it sharp and specific, no new stimuli."}
                    </div>
                  </div>
                </div>
              )}
            </Field>
          )}
        </div>
      );
    }
    case "🩹 Injuries": {
      const current = data.injuries || [];
      return (
        <div>
          <p className="text-xs mb-3" style={{ color: C.sub }}>We'll prime and work around these in every session.</p>
          <div className="grid grid-cols-1 gap-2.5">
            {INJURY_AREAS.map(opt => {
              const isActive = current.includes(opt);
              return (
                <button key={opt} onClick={() => {
                  if (opt === "None currently") { set("injuries", ["None currently"]); return; }
                  const without = current.filter(x => x !== "None currently");
                  set("injuries", isActive ? without.filter(x => x !== opt) : [...without, opt]);
                }} className="text-left rounded-lg px-4 py-3.5 flex items-center justify-between"
                  style={{ background: isActive ? `${C.orange}18` : C.panel, border: `1px solid ${isActive ? C.orange : C.border}` }}>
                  <span style={{ color: isActive ? C.orange : C.text, fontWeight: isActive ? 600 : 400 }}>{opt}</span>
                  {isActive && <Check size={16} style={{ color: C.orange }} />}
                </button>
              );
            })}
          </div>
          {current.some(i => i !== "None currently") && (
            <Field label="Anything else we should know?">
              <textarea style={{ ...inputStyle, minHeight: 60, marginTop: 10 }} placeholder="Details on the injury, limitations, cleared by a doctor, etc."
                value={data.injuryNotes || ""} onChange={e => set("injuryNotes", e.target.value)} />
            </Field>
          )}
        </div>
      );
    }
    case "📏 Height": {
      return (
        <div>
          <div className="flex justify-end mb-4"><UnitToggle value={data.heightUnit} options={["imperial", "metric"]} onChange={v => set("heightUnit", v)} /></div>
          <HeightDial unit={data.heightUnit} valueCm={data.heightCm} onChange={v => set("heightCm", v)} />
        </div>
      );
    }
    case "⚖️ Weight": {
      const lb = data.weightUnit === "lb" ? data.weightLb : kgToLb(data.weightLb);
      const sliderLb = Math.min(300, Math.max(100, data.weightLb || 175));
      const pct = ((sliderLb - 100) / (300 - 100)) * 100;
      return (
        <div>
          <style>{`
            .weight-slider {
              -webkit-appearance: none; appearance: none;
              width: 100%; height: 10px; border-radius: 999px; outline: none;
              background: linear-gradient(to right, ${C.orange} 0%, ${C.orange} ${pct}%, ${C.border} ${pct}%, ${C.border} 100%);
            }
            .weight-slider::-webkit-slider-thumb {
              -webkit-appearance: none; appearance: none;
              width: 34px; height: 34px; border-radius: 50%;
              background: ${C.orange}; border: 4px solid #fff;
              box-shadow: 0 2px 10px rgba(0,0,0,0.35); cursor: pointer;
            }
            .weight-slider::-moz-range-thumb {
              width: 34px; height: 34px; border-radius: 50%;
              background: ${C.orange}; border: 4px solid #fff;
              box-shadow: 0 2px 10px rgba(0,0,0,0.35); cursor: pointer;
            }
            .weight-slider::-moz-range-track { height: 10px; border-radius: 999px; background: ${C.border}; }
          `}</style>

          <div className="flex justify-end mb-4"><UnitToggle value={data.weightUnit} options={["lb", "kg"]} onChange={v => set("weightUnit", v)} /></div>

          <div className="text-center mb-6">
            <div style={{ fontSize: 44, fontFamily: "JetBrains Mono", fontWeight: 800, color: C.text }}>
              {data.weightLb ? (data.weightUnit === "lb" ? Math.round(data.weightLb) : Math.round(lbToKg(data.weightLb))) : "—"}
            </div>
            <div className="text-sm mt-1" style={{ color: C.sub }}>{data.weightUnit === "lb" ? "pounds" : "kilograms"}</div>
          </div>

          <div className="px-2 py-4 rounded-2xl" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <input
              type="range" min={100} max={300} step={1}
              value={sliderLb}
              onChange={e => set("weightLb", Number(e.target.value))}
              className="weight-slider"
            />
            <div className="flex justify-between text-[10px] mt-2 px-0.5" style={{ color: C.faint }}>
              <span>100 lb</span>
              <span>150</span>
              <span>200</span>
              <span>250</span>
              <span>300+ lb</span>
            </div>
          </div>

          {(data.weightLb || 0) >= 300 && (
            <p className="text-center text-xs mt-3" style={{ color: C.sub }}>At the top of the slider — tap below to type an exact number if you're over 300 lb.</p>
          )}

          <div className="text-center mt-4">
            <input type="number" style={{ ...inputStyle, textAlign: "center", fontSize: 16, padding: "10px", maxWidth: 160, margin: "0 auto" }}
              placeholder="Type exact number"
              value={data.weightLb ? (data.weightUnit === "lb" ? data.weightLb : lbToKg(data.weightLb)) : ""}
              onChange={e => {
                const v = parseFloat(e.target.value) || 0;
                set("weightLb", data.weightUnit === "lb" ? v : kgToLb(v));
              }} />
          </div>
        </div>
      );
    }
    case "📅 Training Schedule": {
      const days = [2, 3, 4, 5, 6, 7];
      const exp = data.experience || "Beginner";
      return (
        <div>
          <p className="text-xs mb-3" style={{ color: C.sub }}>How many days per week can you realistically train?</p>
          <div className="grid grid-cols-3 gap-2.5">
            {days.map(d => (
              <button key={d} onClick={() => set("daysPerWeek", d)} className="rounded-lg p-3.5 text-center"
                style={{ background: data.daysPerWeek === d ? `${C.orange}18` : C.panel, border: `1px solid ${data.daysPerWeek === d ? C.orange : C.border}` }}>
                <div className="font-mono font-bold text-xl" style={{ color: data.daysPerWeek === d ? C.orange : C.text }}>{d}</div>
                <div className="text-[10px]" style={{ color: C.sub }}>days/wk</div>
              </button>
            ))}
          </div>

        </div>
      );
    }
    case "🏋️ Equipment": {
      const list = [
        "Full gym access", "MMA gym (bags, mats, etc.)", "Barbell + rack", "Dumbbells",
        "Kettlebells", "Resistance bands", "Pull-up bar", "Med ball", "Sled / prowler",
        "Cardio equipment (bike, rower, etc.)", "Bodyweight only"
      ];
      const current = data.equipment || [];
      return (
        <div>
          <p className="text-xs mb-3" style={{ color: C.sub }}>Select everything you have access to — your program will only use what you've checked.</p>
          <div className="grid grid-cols-1 gap-2.5">
            {list.map(opt => {
              const isActive = current.includes(opt);
              return (
                <button key={opt} onClick={() => set("equipment", isActive ? current.filter(x => x !== opt) : [...current, opt])}
                  className="text-left rounded-lg px-4 py-3.5 flex items-center justify-between"
                  style={{ background: isActive ? `${C.orange}18` : C.panel, border: `1px solid ${isActive ? C.orange : C.border}` }}>
                  <span style={{ color: isActive ? C.orange : C.text, fontWeight: isActive ? 600 : 400 }}>{opt}</span>
                  {isActive && <Check size={16} style={{ color: C.orange }} />}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    default: return null;
  }
}

// ============================================================
// SHARED CHROME
// ============================================================

function TopBar({ title, onLogout, right }) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-5 py-4" style={{ background: `${C.bg}ee`, backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.border}` }}>
      <h1 className="text-xl font-bold tracking-tight truncate" style={{ fontFamily: "Inter", color: C.text }}>{title}</h1>
      <div className="flex items-center gap-3 shrink-0">
        {right}
        {onLogout && <button onClick={onLogout} style={{ color: C.sub }}><LogOut size={18} /></button>}
      </div>
    </div>
  );
}

function BottomNav({ items, active, onChange }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 flex justify-around items-center py-2 px-1.5" style={{ background: `${C.bg}f5`, backdropFilter: "blur(10px)", borderTop: `1px solid ${C.border}` }}>
      {items.map(it => {
        const isActive = active === it.key;
        return (
          <button key={it.key} onClick={() => onChange(it.key)} className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-2xl min-w-0 transition-colors"
            style={{ background: isActive ? `${C.orange}26` : "transparent" }}>
            <it.icon size={19} style={{ color: isActive ? C.orange : "#6B7078" }} />
            <span className="text-[9px] font-medium truncate" style={{ color: isActive ? C.orange : "#6B7078" }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// EXERCISE SWAP MODAL — pattern-matched, full pick list
// ============================================================
function ExerciseSwapModal({ open, onClose, currentExercise, exercises, onSwap, reasonPreset }) {
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState(reasonPreset || "");
  if (!currentExercise) return null;
  const ex = exercises.find(e => e.id === currentExercise.exerciseId);
  const pattern = ex?.pattern;
  const candidates = exercisesByPattern(pattern, ex?.id).filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
  const phaseLabel = PHASES.find(p => p.key === ex?.phase)?.label;

  return (
    <Modal open={open} onClose={onClose} title="Swap Exercise" wide>
      <div className="mb-4 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <div className="text-xs" style={{ color: C.sub }}>Swapping</div>
        <div className="font-semibold" style={{ color: C.text }}>{ex?.name}</div>
        <div className="text-xs mt-1" style={{ color: C.orange }}>{phaseLabel} · {pattern} pattern</div>
      </div>
      <Field label="Reason (optional)">
        <div className="flex flex-wrap gap-2">
          {["Injury / pain", "Equipment unavailable", "Prefer alternative"].map(r => (
            <Pill key={r} active={reason === r} onClick={() => setReason(r)}>{r}</Pill>
          ))}
        </div>
      </Field>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.faint }} />
        <input style={{ ...inputStyle, paddingLeft: 36 }} placeholder={`Search ${pattern} exercises...`} value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <p className="text-xs mb-2.5" style={{ color: C.sub }}>Showing exercises with the same movement pattern ({pattern}) so the stimulus stays consistent.</p>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {candidates.length === 0 && <div className="text-sm text-center py-6" style={{ color: C.faint }}>No other {pattern} exercises match your search.</div>}
        {candidates.map(c => (
          <button key={c.id} onClick={() => { onSwap(c, reason); onClose(); }}
            className="w-full text-left rounded-lg p-3 flex items-center gap-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
            <div className="rounded-md w-9 h-9 flex items-center justify-center shrink-0 overflow-hidden" style={{ background: C.border }}>
              {exerciseImage(c.name) ? <img src={exerciseImage(c.name)} alt={c.name} className="w-full h-full object-cover" /> : <Dumbbell size={15} style={{ color: C.faint }} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: C.text }}>{c.name}</div>
              <div className="text-xs" style={{ color: C.sub }}>{c.pattern}</div>
            </div>
            {c.hasMedia && <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${C.olive}22`, color: C.olive }}>Media</span>}
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ============================================================
// AI PROGRAM GENERATOR — calls Claude API
// ============================================================
function buildAIPrompt(intake) {
  return `You are an elite strength & conditioning coach. Generate a training program based on this athlete intake. Respond ONLY with valid JSON, no markdown fences, no preamble.

Athlete intake:
- Sex: ${intake.sex || "unspecified"}
- Sport/focus: ${intake["🥊 Sport / Focus"] || "General Fitness"}
- Fighter status: ${intake.isFighter ? "Competing fighter" : "Training only"}
- Discipline: ${intake.discipline || "n/a"}
- Training experience: ${intake.experience || "Beginner"}
- Goals: ${(intake.goals || []).join(", ") || "General fitness"}
- Goal notes: ${intake.goalNotes || "n/a"}
- Timeframe: ${intake.timeframe || "n/a"}${intake.fightDate ? ` (competition date: ${intake.fightDate}, ${Math.max(1, Math.round((new Date(intake.fightDate) - new Date()) / (1000*60*60*24*7)))} weeks out)` : ""}
- Injuries: ${(intake.injuries || []).join(", ") || "None"}
- Injury notes: ${intake.injuryNotes || "n/a"}
- Height: ${intake.heightCm}cm
- Weight: ${intake.weightLb}lb
- Days per week: ${intake.daysPerWeek || 4}
- Equipment: ${(intake.equipment || []).join(", ") || "Full gym access"}

Rules:
- Exercise order within EVERY training day must follow this exact phase sequence (skip phases that don't apply to that day): dynamic warmup, 1-2 primer exercises (movement prep, and injury-specific prehab if injuries are listed), plyometrics/med ball throws, strength work — main compound movements then accessories, cardio (short conditioning pieces like assault bike repeats, sled work, etc.), static stretching and cooldown.
- If a day includes longer aerobic conditioning work (steady-state or extended intervals), give that aerobic work its own dedicated day rather than combining it with a strength session, since it takes significant time on its own.
- Short, low-time-cost conditioning pieces (e.g. short-burst assault bike repeats for explosive-repeat capacity) belong in the cardio slot before stretching/cooldown, not on a separate day.
- If the athlete has injuries, include specific priming/prehab work for that area in the primer exercises and avoid contraindicated movements.
- If sport is MMA, include striking/conditioning elements (bag work, battle ropes) and explosive/rotational power work in the plyometrics/cardio slots.
- Match days per week to the requested schedule.
- Use real exercise names (e.g. "Trap Bar Deadlift", "Med Ball Rotational Slam", "Landmine Press", "Battle Rope Wave Intervals").

Return JSON in this exact shape:
{
  "programName": "string",
  "weeks": number,
  "rationale": "1-2 sentence explanation of the approach",
  "days": [
    {
      "name": "Day 1 — <focus>",
      "exercises": [
        { "phase": "warmup_general|warmup_specific|explosive|compound|hypertrophy|lactic|aerobic|cooldown", "name": "string", "sets": number, "reps": "string", "rpe": number, "rest": "string" }
      ]
    }
  ]
}`;
}

function parseAIJson(text) {
  if (!text) throw new Error("No response content from AI");
  let clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start !== -1 && end !== -1) clean = clean.slice(start, end + 1);
  clean = clean.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  clean = clean.replace(/,(\s*[}\]])/g, "$1"); // strip trailing commas
  try {
    return JSON.parse(clean);
  } catch (e) {
    // Response likely got cut off mid-structure. Trim back to the last complete
    // element and auto-close any open braces/brackets, then retry once.
    let repaired = clean.replace(/,\s*"[^"]*"?\s*:?\s*("[^"]*)?$/, ""); // drop dangling trailing property
    repaired = repaired.replace(/,\s*$/, "");
    const stack = [];
    let inStr = false, esc = false;
    for (const ch of repaired) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{" || ch === "[") stack.push(ch);
      else if (ch === "}" && stack[stack.length - 1] === "{") stack.pop();
      else if (ch === "]" && stack[stack.length - 1] === "[") stack.pop();
    }
    if (inStr) repaired += '"';
    while (stack.length) repaired += stack.pop() === "{" ? "}" : "]";
    return JSON.parse(repaired);
  }
}

// Builds the day/exercise structure with local exerciseIds, matching by name
// against existing exercises (seed library or ones already known locally).
// Used both for freshly-generated AI programs AND for reloading a program from the DB.
function buildDaysWithExerciseIds(rawDays, state) {
  const newExercises = [];
  const days = (rawDays || []).map(d => ({
    id: "d" + Math.random().toString(36).slice(2, 9), name: d.name,
    exercises: (d.exercises || []).map(x => {
      let match = state.exercises.find(e => e.name.toLowerCase() === x.name.toLowerCase());
      if (!match) {
        match = { id: "eai" + Math.random().toString(36).slice(2, 9), name: x.name, phase: x.phase, pattern: "AI-Generated", hasMedia: false };
        newExercises.push(match);
      }
      return { id: "x" + Math.random().toString(36).slice(2, 9), exerciseId: match.id, phase: x.phase, sets: x.sets, reps: x.reps, rpe: x.rpe, rest: x.rest };
    }).sort((a, b) => phaseIndex(a.phase) - phaseIndex(b.phase))
  }));
  return { days, newExercises };
}

// Inverse of the above — turns local exerciseId-based days back into plain
// name-based JSON for saving to the database (so it survives independent of
// this session's locally-generated exercise ids).
function denormalizeDays(days, state) {
  return (days || []).map(d => ({
    name: d.name,
    exercises: (d.exercises || []).map(x => {
      const ex = state.exercises.find(e => e.id === x.exerciseId);
      return { name: ex?.name || "Unknown Exercise", phase: x.phase, sets: x.sets, reps: x.reps, rpe: x.rpe, rest: x.rest };
    })
  }));
}

function applyGeneratedProgram(result, state, intake, programId) {
  const { days, newExercises } = buildDaysWithExerciseIds(result.days, state);
  const newProgram = { id: programId || ("plocal" + Date.now()), name: result.programName, weeks: result.weeks || 6, assignedCount: 1, sport: intake?.["🥊 Sport / Focus"] || "General Fitness", days };
  return {
    ...state,
    programs: [...state.programs, newProgram],
    exercises: [...state.exercises, ...newExercises],
    me: { ...state.me, program: newProgram.id, customProgram: null },
  };
}

// Creates a new program row from a freshly-generated AI result (already name-based JSON).
async function createProgramRow(athleteId, name, weeks, sport, rawDays) {
  const { data, error } = await supabase.from("programs").insert({ athlete_id: athleteId, name, weeks, sport, days: rawDays }).select().single();
  if (error || !data) return null;
  await supabase.from("profiles").update({ active_program_id: data.id }).eq("id", athleteId);
  return data.id;
}

// Updates an existing program row after a manual edit (reorder/swap) — local
// days are in exerciseId form, so they need denormalizing back to plain names first.
async function updateProgramRow(programId, days, state) {
  const { error } = await supabase.from("programs").update({ days: denormalizeDays(days, state) }).eq("id", programId);
  return !error;
}

function AIProgramGenerator({ intake, onGenerated, onClose }) {
  const [status, setStatus] = useState("idle"); // idle | loading | error | done
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState(null);

  const generate = async () => {
    setStatus("loading"); setErrorMsg("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          messages: [{ role: "user", content: buildAIPrompt(intake) }],
        })
      });
      const data = await response.json();
      const textBlock = (data.content || []).find(b => b.type === "text");
      const parsed = parseAIJson(textBlock?.text);
      setResult(parsed);
      setStatus("done");
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong generating your program.");
      setStatus("error");
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="AI Program Generator" wide>
      {status === "idle" && (
        <div className="text-center py-4">
          <div className="rounded-full w-14 h-14 mx-auto flex items-center justify-center mb-4" style={{ background: `${C.orange}22` }}>
            <Bot size={26} style={{ color: C.orange }} />
          </div>
          <p className="text-sm mb-1" style={{ color: C.text }}>Generate a program from this athlete's intake data.</p>
          <p className="text-xs mb-6" style={{ color: C.sub }}>Goals, injuries, sport, schedule, and equipment will all be factored in — with correct phase ordering.</p>
          <Btn className="w-full" icon={Sparkles} onClick={generate}>Generate Program</Btn>
        </div>
      )}
      {status === "loading" && (
        <div className="text-center py-10">
          <Loader2 size={32} className="animate-spin mx-auto mb-4" style={{ color: C.orange }} />
          <p className="text-sm" style={{ color: C.sub }}>Building a program around the athlete's profile...</p>
        </div>
      )}
      {status === "error" && (
        <div className="text-center py-6">
          <AlertCircle size={28} className="mx-auto mb-3" style={{ color: C.red }} />
          <p className="text-sm mb-1" style={{ color: C.text }}>Couldn't generate a program.</p>
          <p className="text-xs mb-5" style={{ color: C.sub }}>{errorMsg}</p>
          <Btn variant="secondary" icon={RefreshCw} onClick={generate}>Try Again</Btn>
        </div>
      )}
      {status === "done" && result && (
        <div>
          <div className="rounded-lg p-3.5 mb-4" style={{ background: `${C.olive}18`, border: `1px solid ${C.olive}55` }}>
            <div className="font-semibold text-sm" style={{ color: C.olive }}>{result.programName}</div>
            <div className="text-xs mt-1" style={{ color: C.text }}>{result.rationale}</div>
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto mb-4">
            {(result.days || []).map((d, i) => (
              <div key={i} className="rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                <div className="text-sm font-semibold mb-1.5" style={{ color: C.text, fontFamily: "Inter" }}>{d.name}</div>
                <div className="space-y-1">
                  {(d.exercises || []).map((x, j) => (
                    <div key={j} className="text-xs flex justify-between" style={{ color: C.sub }}>
                      <span>{x.name}</span>
                      <span className="font-mono shrink-0 ml-2">{x.sets}×{x.reps} RPE{x.rpe}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2.5">
            <Btn variant="secondary" className="flex-1" icon={RefreshCw} onClick={generate}>Regenerate</Btn>
            <Btn className="flex-1" icon={Check} onClick={() => onGenerated(result)}>Use This Program</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ============================================================
// COACH PORTAL
// ============================================================

function CoachDashboard({ state, nav }) {
  const totalAthletes = state.athletes.length;
  const activePrograms = state.programs.length;
  const unread = Object.values(state.messages).flat().filter(m => m.from === "athlete").length;
  const payments = state.payments || { rates: [], clientBilling: {}, methods: [] };
  const monthlyRevenue = state.athletes.reduce((sum, a) => {
    const billing = payments.clientBilling[a.id];
    if (!billing) return sum;
    const rate = payments.rates.find(r => r.id === billing.rateId);
    if (!rate) return sum;
    const amt = parseFloat(rate.amount) || 0;
    if (rate.cycle === "Monthly") return sum + amt;
    if (rate.cycle === "Weekly") return sum + amt * 4;
    if (rate.cycle === "Quarterly") return sum + amt / 3;
    return sum + amt;
  }, 0);

  return (
    <div className="pb-28">
      <TopBar title="Dashboard" onLogout={nav.logout} />
      <div className="px-5 pt-5">
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <StatCard icon={Users} label="Athletes" value={totalAthletes} />
          <StatCard icon={ClipboardList} label="Programs" value={activePrograms} accent={C.blue} />
        </div>
        <button onClick={() => nav.go("coach-payments")} className="w-full rounded-xl p-3.5 mb-6 flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, ${C.gradFrom}33, ${C.gradTo}22)`, border: `1px solid ${C.orange}44` }}>
          <div>
            <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.sub }}>Est. Monthly Revenue</div>
            <div className="font-mono font-bold text-2xl mt-0.5" style={{ color: C.orange }}>${monthlyRevenue.toLocaleString()}</div>
          </div>
          <ChevronRight size={18} style={{ color: C.orange }} />
        </button>

        <ChalkDivider label="Recent Activity" />
        <div className="space-y-2.5">
          {state.athletes.slice(0, 4).map(a => (
            <button key={a.id} onClick={() => nav.go("coach-athlete-detail", a.id)} className="w-full rounded-xl p-3.5 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <Avatar initials={a.avatar} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate" style={{ color: C.text }}>{a.name}</div>
                <div className="text-xs truncate" style={{ color: C.sub }}>{a.sport} · Active {a.lastActive}</div>
              </div>
              {a.streak > 0 && <div className="flex items-center gap-1 text-xs font-mono font-bold shrink-0" style={{ color: C.amber }}><Flame size={14} /> {a.streak}</div>}
            </button>
          ))}
        </div>

        <ChalkDivider label="Quick Actions" />
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => nav.go("coach-programs")} className="rounded-xl p-4 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <ClipboardList size={20} style={{ color: C.orange }} className="mb-2" />
            <div className="text-sm font-semibold" style={{ color: C.text }}>Build Program</div>
          </button>
          <button onClick={() => nav.go("coach-athletes")} className="rounded-xl p-4 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <Users size={20} style={{ color: C.blue }} className="mb-2" />
            <div className="text-sm font-semibold" style={{ color: C.text }}>Manage Roster</div>
          </button>
        </div>
      </div>
    </div>
  );
}

function CoachAthletes({ state, setState, nav }) {
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [assignOpen, setAssignOpen] = useState(null);

  const filtered = state.athletes.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  const sendInvite = () => {
    if (!inviteEmail) return;
    const newA = { id: "a" + Date.now(), name: inviteEmail.split("@")[0], sport: "Pending profile", streak: 0, lastActive: "Invited", avatar: "??", program: null, injuries: [], goals: [] };
    setState(s => ({ ...s, athletes: [...s.athletes, newA] }));
    setInviteEmail(""); setInviteOpen(false);
  };

  const assignProgram = (athleteId, programId) => {
    setState(s => ({ ...s, athletes: s.athletes.map(a => a.id === athleteId ? { ...a, program: programId } : a) }));
    setAssignOpen(null);
  };

  return (
    <div className="pb-28">
      <TopBar title="Athletes" onLogout={nav.logout} right={<button onClick={() => setInviteOpen(true)}><Plus size={20} style={{ color: C.orange }} /></button>} />
      <div className="px-5 pt-4">
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.faint }} />
          <input style={{ ...inputStyle, paddingLeft: 36 }} placeholder="Search athletes..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="space-y-2.5">
          {filtered.map(a => {
            const prog = state.programs.find(p => p.id === a.program);
            return (
              <div key={a.id} className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <button onClick={() => nav.go("coach-athlete-detail", a.id)} className="w-full flex items-center gap-3 text-left">
                  <Avatar initials={a.avatar} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate" style={{ color: C.text }}>{a.name}</div>
                    <div className="text-xs truncate" style={{ color: C.sub }}>{a.sport}</div>
                  </div>
                  {a.streak > 0 && <div className="flex items-center gap-1 text-xs font-mono font-bold shrink-0" style={{ color: C.amber }}><Flame size={13} />{a.streak}</div>}
                  <ChevronRight size={16} style={{ color: C.faint }} className="shrink-0" />
                </button>
                <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
                  <span className="text-xs truncate" style={{ color: prog ? C.olive : C.sub }}>{prog ? prog.name : "No program assigned"}</span>
                  <button onClick={() => setAssignOpen(a.id)} className="text-xs font-semibold shrink-0 ml-2" style={{ color: C.orange }}>Assign</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Athlete">
        <Field label="Email address"><input style={inputStyle} placeholder="athlete@email.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} /></Field>
        <Btn className="w-full" onClick={sendInvite} icon={Send}>Send Invite</Btn>
      </Modal>

      <Modal open={!!assignOpen} onClose={() => setAssignOpen(null)} title="Assign Program">
        <div className="space-y-2.5">
          {state.programs.map(p => (
            <button key={p.id} onClick={() => assignProgram(assignOpen, p.id)} className="w-full text-left rounded-lg p-3.5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
              <div className="font-semibold text-sm" style={{ color: C.text }}>{p.name}</div>
              <div className="text-xs mt-0.5" style={{ color: C.sub }}>{p.weeks} weeks · {p.days.length} days/cycle</div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// Coach view of one athlete: metrics, results, AND per-athlete program editing
function CoachAthleteDetail({ state, setState, nav, athleteId }) {
  const athlete = state.athletes.find(a => a.id === athleteId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeDayId, setActiveDayId] = useState(null);
  const [swapTarget, setSwapTarget] = useState(null);
  const exById = id => state.exercises.find(e => e.id === id);

  if (!athlete) return null;

  // per-athlete override: clone program into athlete.customProgram on first edit
  const program = athlete.customProgram || state.programs.find(p => p.id === athlete.program);

  const ensureCustom = (updater) => {
    setState(s => ({
      ...s,
      athletes: s.athletes.map(a => {
        if (a.id !== athleteId) return a;
        const base = a.customProgram || state.programs.find(p => p.id === a.program);
        if (!base) return a;
        return { ...a, customProgram: updater(JSON.parse(JSON.stringify(base))) };
      })
    }));
  };

  const addExerciseToDay = (dayId, exercise) => {
    ensureCustom(prog => ({
      ...prog, days: prog.days.map(d => d.id === dayId ? { ...d, exercises: [...d.exercises, { id: "x" + Date.now(), exerciseId: exercise.id, phase: exercise.phase, sets: 3, reps: "10", rpe: 7, rest: "90s" }] } : d)
    }));
  };
  const removeExercise = (dayId, xId) => {
    ensureCustom(prog => ({ ...prog, days: prog.days.map(d => d.id === dayId ? { ...d, exercises: d.exercises.filter(x => x.id !== xId) } : d) }));
  };
  const deleteExerciseGlobally = (exerciseId) => {
    setState(s => ({
      ...s,
      exercises: s.exercises.filter(e => e.id !== exerciseId),
      programs: s.programs.map(p => ({ ...p, days: p.days.map(d => ({ ...d, exercises: d.exercises.filter(x => x.exerciseId !== exerciseId) })) })),
      athletes: s.athletes.map(a => a.customProgram ? { ...a, customProgram: { ...a.customProgram, days: a.customProgram.days.map(d => ({ ...d, exercises: d.exercises.filter(x => x.exerciseId !== exerciseId) })) } } : a),
    }));
  };
  const [removeTarget, setRemoveTarget] = useState(null);
  const updateExerciseField = (dayId, xId, field, value) => {
    ensureCustom(prog => ({ ...prog, days: prog.days.map(d => d.id === dayId ? { ...d, exercises: d.exercises.map(x => x.id === xId ? { ...x, [field]: value } : x) } : d) }));
  };
  const swapExercise = (dayId, xId, newExercise) => {
    ensureCustom(prog => ({ ...prog, days: prog.days.map(d => d.id === dayId ? { ...d, exercises: d.exercises.map(x => x.id === xId ? { ...x, exerciseId: newExercise.id, phase: newExercise.phase } : x) } : d) }));
  };

  const sortedExercises = (day) => [...day.exercises].sort((a, b) => phaseIndex(a.phase) - phaseIndex(b.phase));

  return (
    <div className="pb-28">
      <TopBar title={athlete.name} right={<button onClick={() => nav.go("coach-athletes")} style={{ color: C.sub }}><X size={20} /></button>} />
      <div className="px-5 pt-4">
        <div className="flex items-center gap-3 mb-5">
          <Avatar initials={athlete.avatar} size={56} />
          <div className="min-w-0">
            <div className="font-semibold" style={{ color: C.text }}>{athlete.name}</div>
            <div className="text-xs" style={{ color: C.sub }}>{athlete.sport} · {athlete.sex === "male" ? "Male" : "Female"}</div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {(athlete.goals || []).map(g => <span key={g} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${C.blue}22`, color: C.blue }}>{g}</span>)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <StatCard icon={Scale} label="⚖️ Weight" value={`${kgToLb(athlete.weightKg)}`} sub="lb" />
          <StatCard icon={Ruler} label="📏 Height" value={(() => { const { ft, inch } = cmToFtIn(athlete.heightCm); return `${ft}'${inch}"`; })()} accent={C.blue} />
          <StatCard icon={Flame} label="Streak" value={athlete.streak} accent={C.amber} />
        </div>

        {(athlete.goals || []).length > 0 && (
          <div className="rounded-xl p-3.5 mb-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.sub }}>Client Goals</div>
            <div className="flex flex-wrap gap-2">
              {athlete.goals.map(g => <span key={g} className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: `${C.orange}22`, color: C.orange }}>{g}</span>)}
            </div>
          </div>
        )}

        {/* Weekly accountability tracker */}
        {(() => {
          const today = new Date(); const dow = today.getDay();
          const weekDays = Array.from({length:7},(_,i)=>{const d=new Date(today);d.setDate(today.getDate()-dow+i);return d;});
          const loggedDates = new Set(state.workoutLogs.map(l=>l.date));
          const dayLabels=["S","M","T","W","T","F","S"];
          const completed=weekDays.filter(d=>loggedDates.has(d.toISOString().slice(0,10))).length;
          return (
            <div className="rounded-xl p-4 mb-5" style={{background:C.panel,border:`1px solid ${C.border}`}}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold" style={{color:C.text}}>This Week's Accountability</div>
                <div className="text-xs font-mono font-semibold" style={{color:completed>=3?C.olive:C.sub}}>{completed}/7</div>
              </div>
              <div className="flex gap-1.5 justify-between">
                {weekDays.map((d,i)=>{const done=loggedDates.has(d.toISOString().slice(0,10));return(
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-[9px]" style={{color:C.faint}}>{dayLabels[i]}</div>
                    <div className="w-full aspect-square rounded-lg flex items-center justify-center" style={{background:done?C.olive:C.border}}>
                      {done&&<CheckCircle2 size={12} style={{color:"#fff"}}/>}
                    </div>
                  </div>
                );})}
              </div>
            </div>
          );
        })()}

        {athlete.injuries?.length > 0 && (
          <div className="rounded-lg p-3 mb-5 flex items-start gap-2" style={{ background: `${C.red}18`, border: `1px solid ${C.red}55` }}>
            <AlertCircle size={15} style={{ color: C.red }} className="mt-0.5 shrink-0" />
            <div className="text-xs" style={{ color: C.red }}>Injury flags: {athlete.injuries.join(", ")}</div>
          </div>
        )}

        {/* Billing status */}
        {(() => {
          const payments = state.payments || { rates: [], clientBilling: {}, methods: [] };
          const billing = payments.clientBilling[athlete.id];
          const rate = billing ? payments.rates.find(r => r.id === billing.rateId) : null;
          return (
            <div className="rounded-xl p-4 mb-5" style={{ background: C.panel, border: `1px solid ${rate ? C.olive + "88" : C.border}` }}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.sub }}>Billing</div>
                <button onClick={() => nav.go("coach-payments")} className="text-xs font-semibold" style={{ color: C.orange }}>Manage →</button>
              </div>
              {rate ? (
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: C.text }}>{rate.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: C.sub }}>{rate.cycle} · Next due {formatLogDate(billing.nextDue)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-xl" style={{ color: C.olive }}>${rate.amount}</div>
                      <div className="text-[10px]" style={{ color: C.faint }}>{billing.paidCount || 0} paid</div>
                    </div>
                  </div>
                  {(payments.methods || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {payments.methods.map(m => <span key={m} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${C.blue}22`, color: C.blue }}>{m}</span>)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: C.faint }}>No billing set up for this client</span>
                  <button onClick={() => nav.go("coach-payments")} className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: `${C.orange}18`, color: C.orange }}>Set Up</button>
                </div>
              )}
            </div>
          );
        })()}

        <ChalkDivider label="Progress History" />
        <div className="rounded-xl p-4 mb-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          {state.progress.length === 0 ? (
            <div className="text-center text-xs py-6" style={{ color: C.faint }}>No progress entries logged yet.</div>
          ) : (
          <div className="flex items-end gap-2 h-24">
            {state.progress.map((d, i) => {
              const vals = state.progress.map(p => p.weightKg);
              const max = Math.max(...vals), min = Math.min(...vals);
              const h = ((d.weightKg - min + 1) / (max - min + 2)) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-md" style={{ height: `${h}%`, background: i === state.progress.length - 1 ? C.orange : C.steel }} />
                  <span className="text-[8px]" style={{ color: C.faint }}>{d.date.split(" ")[1] || d.date}</span>
                </div>
              );
            })}
          </div>
          )}
        </div>

        <ChalkDivider label="Assigned Program — Edit" />
        {!program && <div className="text-sm text-center py-6" style={{ color: C.sub }}>No program assigned yet.</div>}
        {program && (
          <div className="space-y-4">
            {program.days.map(day => (
              <div key={day.id} className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="font-semibold mb-3" style={{ fontFamily: "Inter", color: C.text }}>{day.name}</div>
                <div className="space-y-2">
                  {sortedExercises(day).map(x => {
                    const ex = exById(x.exerciseId);
                    const phaseLabel = PHASES.find(p => p.key === x.phase)?.short;
                    return (
                      <div key={x.id} className="rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0" style={{ background: `${C.orange}22`, color: C.orange }}>{phaseLabel}</span>
                          <span className="text-sm font-medium truncate flex-1" style={{ color: C.text }}>{ex?.name}</span>
                          <button onClick={() => setSwapTarget({ dayId: day.id, x })}><RotateCcw size={14} style={{ color: C.blue }} /></button>
                          <button onClick={() => setRemoveTarget({ dayId: day.id, xId: x.id, exerciseId: x.exerciseId, name: ex?.name || "Exercise" })}><Trash2 size={14} style={{ color: C.sub }} /></button>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {["sets", "reps", "rpe", "rest"].map(field => (
                            <input key={field} value={x[field]} onChange={e => updateExerciseField(day.id, x.id, field, field === "sets" || field === "rpe" ? Number(e.target.value) || 0 : e.target.value)}
                              className="text-center font-mono text-xs rounded py-1.5" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                          ))}
                        </div>
                        <div className="grid grid-cols-4 gap-1.5 mt-1">
                          {["Sets", "Reps", "RPE", "Rest"].map(l => <div key={l} className="text-center text-[8px]" style={{ color: C.faint }}>{l}</div>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => { setActiveDayId(day.id); setPickerOpen(true); }}
                  className="w-full mt-3 rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
                  style={{ background: `${C.orange}18`, color: C.orange, border: `1px dashed ${C.orange}66` }}>
                  <BookOpen size={15} /> Add From Library
                </button>
              </div>
            ))}
            <div className="text-xs text-center" style={{ color: C.faint }}>Edits here apply only to {athlete.name.split(" ")[0]} — the shared program template is unaffected.</div>
          </div>
        )}
      </div>

      <ExercisePickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} exercises={state.exercises} onPick={(ex) => addExerciseToDay(activeDayId, ex)} />
      <ExerciseSwapModal open={!!swapTarget} onClose={() => setSwapTarget(null)} currentExercise={swapTarget?.x} exercises={state.exercises}
        onSwap={(newEx) => swapExercise(swapTarget.dayId, swapTarget.x.id, newEx)} />
      <RemoveExerciseModal open={!!removeTarget} onClose={() => setRemoveTarget(null)} exerciseName={removeTarget?.name}
        onRemoveFromDay={() => { removeExercise(removeTarget.dayId, removeTarget.xId); setRemoveTarget(null); }}
        onDeleteFromLibrary={() => { deleteExerciseGlobally(removeTarget.exerciseId); setRemoveTarget(null); }} />
    </div>
  );
}

function RemoveExerciseModal({ open, onClose, exerciseName, onRemoveFromDay, onDeleteFromLibrary }) {
  return (
    <Modal open={open} onClose={onClose} title="Remove Exercise">
      <p className="text-sm mb-5" style={{ color: C.text }}>
        What do you want to do with <span className="font-semibold">{exerciseName}</span>?
      </p>
      <div className="space-y-2.5">
        <button onClick={onRemoveFromDay} className="w-full text-left rounded-lg p-3.5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
          <div className="text-sm font-medium" style={{ color: C.text }}>Remove from this day</div>
          <div className="text-xs mt-0.5" style={{ color: C.sub }}>Stays in the exercise library, just taken out of this workout.</div>
        </button>
        <button onClick={onDeleteFromLibrary} className="w-full text-left rounded-lg p-3.5" style={{ background: `${C.red}14`, border: `1px solid ${C.red}55` }}>
          <div className="text-sm font-medium" style={{ color: C.red }}>Delete from library entirely</div>
          <div className="text-xs mt-0.5" style={{ color: C.red }}>Removes it everywhere — every program and day that uses it.</div>
        </button>
      </div>
      <Btn variant="ghost" className="w-full mt-3" onClick={onClose}>Cancel</Btn>
    </Modal>
  );
}

function ExercisePickerModal({ open, onClose, onPick, exercises }) {
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const list = exercises.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) && (phaseFilter === "all" || e.phase === phaseFilter));

  return (
    <Modal open={open} onClose={onClose} title="Exercise Library" wide>
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        <Pill active={phaseFilter === "all"} onClick={() => setPhaseFilter("all")}>All</Pill>
        {PHASES.map(p => <Pill key={p.key} active={phaseFilter === p.key} onClick={() => setPhaseFilter(p.key)}>{p.short}</Pill>)}
      </div>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.faint }} />
        <input style={{ ...inputStyle, paddingLeft: 36 }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {list.map(ex => (
          <button key={ex.id} onClick={() => { onPick(ex); onClose(); }} className="w-full text-left rounded-lg p-3 flex items-center gap-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
            <div className="rounded-md w-10 h-10 flex items-center justify-center shrink-0 overflow-hidden" style={{ background: C.border }}>{exerciseImage(ex.name) ? <img src={exerciseImage(ex.name)} alt={ex.name} className="w-full h-full object-cover" /> : <Dumbbell size={16} style={{ color: C.faint }} />}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: C.text }}>{ex.name}</div>
              <div className="text-xs truncate" style={{ color: C.sub }}>{ex.pattern}</div>
            </div>
            {ex.hasMedia && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${C.olive}22`, color: C.olive }}>Media</span>}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function CoachPrograms({ state, setState, nav }) {
  const [editing, setEditing] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeDayId, setActiveDayId] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const exById = id => state.exercises.find(e => e.id === id);

  const createProgram = () => {
    const np = { id: "p" + Date.now(), name: "New Program", weeks: 4, assignedCount: 0, sport: "General Fitness", days: [{ id: "d" + Date.now(), name: "Day 1", exercises: [] }] };
    setState(s => ({ ...s, programs: [...s.programs, np] }));
    setEditing(np.id);
  };

  const prog = state.programs.find(p => p.id === editing);
  const addDay = () => setState(s => ({ ...s, programs: s.programs.map(p => p.id === editing ? { ...p, days: [...p.days, { id: "d" + Date.now(), name: `Day ${p.days.length + 1}`, exercises: [] }] } : p) }));
  const addExerciseToDay = (dayId, exercise) => {
    setState(s => ({ ...s, programs: s.programs.map(p => p.id === editing ? { ...p, days: p.days.map(d => d.id === dayId ? { ...d, exercises: [...d.exercises, { id: "x" + Date.now(), exerciseId: exercise.id, phase: exercise.phase, sets: 3, reps: "10", rpe: 7, rest: "90s" }] } : d) } : p) }));
  };
  const removeExercise = (dayId, xId) => {
    setState(s => ({ ...s, programs: s.programs.map(p => p.id === editing ? { ...p, days: p.days.map(d => d.id === dayId ? { ...d, exercises: d.exercises.filter(x => x.id !== xId) } : d) } : p) }));
  };
  const deleteExerciseGlobally = (exerciseId) => {
    setState(s => ({
      ...s,
      exercises: s.exercises.filter(e => e.id !== exerciseId),
      programs: s.programs.map(p => ({ ...p, days: p.days.map(d => ({ ...d, exercises: d.exercises.filter(x => x.exerciseId !== exerciseId) })) })),
    }));
  };
  const [removeTarget, setRemoveTarget] = useState(null);

  const applyAIProgram = (result) => {
    // map AI exercise names to nearest known exercise or create ad-hoc entries
    const days = (result.days || []).map(d => ({
      id: "d" + Math.random().toString(36).slice(2, 9), name: d.name,
      exercises: (d.exercises || []).map(x => {
        let match = state.exercises.find(e => e.name.toLowerCase() === x.name.toLowerCase());
        if (!match) {
          match = { id: "eai" + Math.random().toString(36).slice(2, 9), name: x.name, phase: x.phase, pattern: "AI-Generated", hasMedia: false };
          setState(s => ({ ...s, exercises: [...s.exercises, match] }));
        }
        return { id: "x" + Math.random().toString(36).slice(2, 9), exerciseId: match.id, phase: x.phase, sets: x.sets, reps: x.reps, rpe: x.rpe, rest: x.rest };
      })
    }));
    const np = { id: "p" + Date.now(), name: result.programName, weeks: result.weeks || 4, assignedCount: 0, sport: "AI-Generated", days };
    setState(s => ({ ...s, programs: [...s.programs, np] }));
    setAiOpen(false);
    setEditing(np.id);
  };

  const sortedExercises = (day) => [...day.exercises].sort((a, b) => phaseIndex(a.phase) - phaseIndex(b.phase));

  if (prog) {
    return (
      <div className="pb-28">
        <TopBar title={prog.name} right={<button onClick={() => setEditing(null)} style={{ color: C.sub }}><X size={20} /></button>} />
        <div className="px-5 pt-4 space-y-5">
          {prog.days.map(day => (
            <div key={day.id} className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <div className="font-semibold mb-3" style={{ fontFamily: "Inter", color: C.text }}>{day.name}</div>
              <div className="space-y-2">
                {sortedExercises(day).map(x => {
                  const ex = exById(x.exerciseId);
                  const phaseLabel = PHASES.find(p => p.key === x.phase)?.short;
                  return (
                    <div key={x.id} className="rounded-lg p-3 flex items-center gap-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0" style={{ background: `${C.orange}22`, color: C.orange }}>{phaseLabel}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: C.text }}>{ex?.name || "Exercise"}</div>
                        <div className="text-xs font-mono mt-0.5" style={{ color: C.sub }}>{x.sets}×{x.reps} · RPE {x.rpe} · rest {x.rest}</div>
                      </div>
                      <button onClick={() => setRemoveTarget({ dayId: day.id, xId: x.id, exerciseId: x.exerciseId, name: ex?.name || "Exercise" })} className="shrink-0"><Trash2 size={15} style={{ color: C.sub }} /></button>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => { setActiveDayId(day.id); setPickerOpen(true); }}
                className="w-full mt-3 rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: `${C.orange}18`, color: C.orange, border: `1px dashed ${C.orange}66` }}>
                <BookOpen size={15} /> From Library
              </button>
            </div>
          ))}
          <Btn variant="secondary" className="w-full" icon={Plus} onClick={addDay}>Add Training Day</Btn>
        </div>
        <ExercisePickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} exercises={state.exercises} onPick={(ex) => addExerciseToDay(activeDayId, ex)} />
        <RemoveExerciseModal open={!!removeTarget} onClose={() => setRemoveTarget(null)} exerciseName={removeTarget?.name}
          onRemoveFromDay={() => { removeExercise(removeTarget.dayId, removeTarget.xId); setRemoveTarget(null); }}
          onDeleteFromLibrary={() => { deleteExerciseGlobally(removeTarget.exerciseId); setRemoveTarget(null); }} />
      </div>
    );
  }

  return (
    <div className="pb-28">
      <TopBar title="Programs" right={<button onClick={createProgram}><Plus size={20} style={{ color: C.orange }} /></button>} />
      <div className="px-5 pt-4">
        <button onClick={() => setAiOpen(true)} className="w-full rounded-xl p-4 mb-4 flex items-center gap-3 text-left" style={{ background: `linear-gradient(135deg, ${C.orange}22, ${C.steel}33)`, border: `1px solid ${C.orange}55` }}>
          <div className="rounded-lg p-2.5 shrink-0" style={{ background: `${C.orange}33` }}><Sparkles size={20} style={{ color: C.orange }} /></div>
          <div className="min-w-0">
            <div className="font-semibold text-sm" style={{ color: C.text }}>Generate with AI</div>
            <div className="text-xs mt-0.5" style={{ color: C.sub }}>Build a program from an athlete's intake automatically</div>
          </div>
        </button>
        <div className="space-y-3">
          {state.programs.map(p => (
            <button key={p.id} onClick={() => setEditing(p.id)} className="w-full text-left rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold truncate" style={{ color: C.text, fontFamily: "Inter" }}>{p.name}</div>
                <ChevronRight size={18} style={{ color: C.faint }} className="shrink-0" />
              </div>
              <div className="text-xs mt-1.5" style={{ color: C.sub }}>{p.weeks} weeks · {p.days.length} days/cycle · {p.assignedCount} assigned</div>
            </button>
          ))}
        </div>
      </div>
      {aiOpen && (
        <AIProgramGenerator
          intake={{ "🥊 Sport / Focus": "MMA", isFighter: true, experience: "Intermediate (1-3 years)", goals: ["Athletic Performance"], injuries: ["None currently"], daysPerWeek: 4, equipment: ["Full gym access"], heightCm: 178, weightLb: 175 }}
          onGenerated={applyAIProgram} onClose={() => setAiOpen(false)} />
      )}
    </div>
  );
}

const PAYMENT_METHODS = ["PayPal", "Venmo", "Cash App", "Zelle", "Bank Transfer", "Visa/Debit", "Stripe"];
const BILLING_CYCLES = ["Monthly", "Per Session", "Quarterly", "Weekly", "One-Time"];

function CoachPayments({ state, setState, nav }) {
  const payments = state.payments || { rates: [], clientBilling: {}, methods: [] };
  const [rateOpen, setRateOpen] = useState(false);
  const [newRate, setNewRate] = useState({ label: "", amount: "", cycle: "Monthly" });
  const [methodOpen, setMethodOpen] = useState(false);
  const [invoiceAthleteId, setInvoiceAthleteId] = useState(null);
  const [invoiceRateId, setInvoiceRateId] = useState(null);

  const updatePayments = (updater) => setState(s => ({ ...s, payments: updater(s.payments || { rates: [], clientBilling: {}, methods: [] }) }));

  const addRate = () => {
    if (!newRate.label || !newRate.amount) return;
    updatePayments(p => ({ ...p, rates: [...p.rates, { id: "r" + Date.now(), ...newRate }] }));
    setNewRate({ label: "", amount: "", cycle: "Monthly" });
    setRateOpen(false);
  };

  const deleteRate = (id) => updatePayments(p => ({ ...p, rates: p.rates.filter(r => r.id !== id) }));

  const toggleMethod = (method) => updatePayments(p => ({
    ...p, methods: p.methods.includes(method) ? p.methods.filter(m => m !== method) : [...p.methods, method]
  }));

  const assignBilling = (athleteId, rateId) => {
    const rate = payments.rates.find(r => r.id === rateId);
    updatePayments(p => ({ ...p, clientBilling: { ...p.clientBilling, [athleteId]: { rateId, assignedAt: todayISO(), status: "Active", nextDue: getNextDue(rate?.cycle), paidCount: 0 } } }));
    setInvoiceAthleteId(null); setInvoiceRateId(null);
  };

  const getNextDue = (cycle) => {
    const d = new Date();
    if (cycle === "Weekly") d.setDate(d.getDate() + 7);
    else if (cycle === "Monthly") d.setMonth(d.getMonth() + 1);
    else if (cycle === "Quarterly") d.setMonth(d.getMonth() + 3);
    else d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  const markPaid = (athleteId) => updatePayments(p => ({
    ...p, clientBilling: { ...p.clientBilling, [athleteId]: { ...p.clientBilling[athleteId], paidCount: (p.clientBilling[athleteId]?.paidCount || 0) + 1, lastPaid: todayISO(), nextDue: getNextDue(payments.rates.find(r => r.id === p.clientBilling[athleteId]?.rateId)?.cycle) } }
  }));

  // Revenue calculations
  const monthlyRevenue = state.athletes.reduce((sum, a) => {
    const billing = payments.clientBilling[a.id];
    if (!billing) return sum;
    const rate = payments.rates.find(r => r.id === billing.rateId);
    if (!rate) return sum;
    const amt = parseFloat(rate.amount) || 0;
    if (rate.cycle === "Monthly") return sum + amt;
    if (rate.cycle === "Weekly") return sum + amt * 4;
    if (rate.cycle === "Quarterly") return sum + amt / 3;
    if (rate.cycle === "Per Session") return sum + amt * 4; // estimate
    return sum + amt;
  }, 0);

  const billedCount = Object.keys(payments.clientBilling).length;

  return (
    <div className="pb-28">
      <TopBar title="Payments" onLogout={nav.logout} />
      <div className="px-5 pt-5">

        {/* Revenue summary */}
        <div className="rounded-2xl p-5 mb-5" style={{ background: `linear-gradient(135deg, ${C.gradFrom}, ${C.gradTo})` }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#ffffff99" }}>Est. Monthly Revenue</div>
          <div className="text-4xl font-bold" style={{ fontFamily: "JetBrains Mono", color: "#fff" }}>${monthlyRevenue.toLocaleString()}</div>
          <div className="text-sm mt-1" style={{ color: "#ffffffcc" }}>{billedCount} of {state.athletes.length} clients billed</div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatCard icon={Users} label="Billed Clients" value={billedCount} accent={C.orange} />
          <StatCard icon={Award} label="Unbilled" value={state.athletes.length - billedCount} accent={C.amber} />
        </div>

        {/* Payment methods */}
        <ChalkDivider label="Accept Payments Via" />
        <div className="flex flex-wrap gap-2 mb-5">
          {PAYMENT_METHODS.map(m => (
            <button key={m} onClick={() => toggleMethod(m)} className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: payments.methods.includes(m) ? `${C.orange}22` : C.panel, color: payments.methods.includes(m) ? C.orange : C.sub, border: `1px solid ${payments.methods.includes(m) ? C.orange : C.border}` }}>
              {m}
            </button>
          ))}
        </div>

        {/* Rates */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.sub }}>My Rates</div>
          <button onClick={() => setRateOpen(true)} className="text-xs font-semibold" style={{ color: C.orange }}>+ Add Rate</button>
        </div>
        {payments.rates.length === 0 ? (
          <div className="rounded-xl p-4 text-center mb-5" style={{ background: C.panel, border: `1px dashed ${C.border}` }}>
            <div className="text-sm" style={{ color: C.faint }}>No rates set yet. Add a rate to start billing clients.</div>
          </div>
        ) : (
          <div className="space-y-2.5 mb-5">
            {payments.rates.map(r => (
              <div key={r.id} className="rounded-xl p-3.5 flex items-center gap-3" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: C.text }}>{r.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: C.sub }}>{r.cycle}</div>
                </div>
                <div className="font-mono font-bold text-lg" style={{ color: C.orange }}>${r.amount}</div>
                <button onClick={() => deleteRate(r.id)}><Trash2 size={15} style={{ color: C.faint }} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Client billing */}
        <ChalkDivider label="Client Billing" />
        <div className="space-y-2.5">
          {state.athletes.map(a => {
            const billing = payments.clientBilling[a.id];
            const rate = billing ? payments.rates.find(r => r.id === billing.rateId) : null;
            return (
              <div key={a.id} className="rounded-xl p-3.5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-3 mb-2.5">
                  <Avatar initials={a.avatar} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: C.text }}>{a.name}</div>
                    {rate ? (
                      <div className="text-xs" style={{ color: C.olive }}>
                        ${rate.amount} / {rate.cycle} · Next due {formatLogDate(billing.nextDue)}
                      </div>
                    ) : (
                      <div className="text-xs" style={{ color: C.faint }}>No billing assigned</div>
                    )}
                  </div>
                  {rate && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${C.olive}22`, color: C.olive }}>
                      {billing.status}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setInvoiceAthleteId(a.id)} className="flex-1 text-xs font-semibold py-2 rounded-lg"
                    style={{ background: `${C.orange}18`, color: C.orange }}>
                    {rate ? "Update Billing" : "Assign Rate"}
                  </button>
                  {rate && (
                    <button onClick={() => markPaid(a.id)} className="flex-1 text-xs font-semibold py-2 rounded-lg"
                      style={{ background: `${C.olive}18`, color: C.olive }}>
                      Mark Paid ✓
                    </button>
                  )}
                </div>
                {billing?.paidCount > 0 && (
                  <div className="text-[10px] mt-1.5 text-center" style={{ color: C.faint }}>{billing.paidCount} payment{billing.paidCount > 1 ? "s" : ""} received · Last {formatLogDate(billing.lastPaid)}</div>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {/* Add Rate Modal */}
      <Modal open={rateOpen} onClose={() => setRateOpen(false)} title="Add Rate">
        <Field label="Rate name">
          <input style={inputStyle} placeholder="e.g. Monthly Coaching, Drop-in Session" value={newRate.label} onChange={e => setNewRate(r => ({ ...r, label: e.target.value }))} />
        </Field>
        <Field label="Amount ($)">
          <input style={inputStyle} type="number" placeholder="150" value={newRate.amount} onChange={e => setNewRate(r => ({ ...r, amount: e.target.value }))} />
        </Field>
        <Field label="Billing cycle">
          <div className="grid grid-cols-2 gap-2">
            {BILLING_CYCLES.map(c => (
              <button key={c} onClick={() => setNewRate(r => ({ ...r, cycle: c }))} className="rounded-lg p-2.5 text-sm"
                style={{ background: newRate.cycle === c ? `${C.orange}18` : C.bg, border: `1px solid ${newRate.cycle === c ? C.orange : C.border}`, color: newRate.cycle === c ? C.orange : C.text }}>
                {c}
              </button>
            ))}
          </div>
        </Field>
        <Btn className="w-full" disabled={!newRate.label || !newRate.amount} onClick={addRate} icon={Plus}>Save Rate</Btn>
      </Modal>

      {/* Assign Rate to Client Modal */}
      <Modal open={!!invoiceAthleteId} onClose={() => setInvoiceAthleteId(null)} title="Assign Billing">
        <p className="text-sm mb-4" style={{ color: C.sub }}>
          Select a rate to assign to {state.athletes.find(a => a.id === invoiceAthleteId)?.name}.
        </p>
        {payments.rates.length === 0 ? (
          <div className="text-sm text-center py-4" style={{ color: C.faint }}>No rates set up yet. Add a rate first.</div>
        ) : (
          <div className="space-y-2 mb-4">
            {payments.rates.map(r => (
              <button key={r.id} onClick={() => setInvoiceRateId(r.id)} className="w-full text-left rounded-lg p-3.5 flex items-center justify-between"
                style={{ background: invoiceRateId === r.id ? `${C.orange}18` : C.bg, border: `1px solid ${invoiceRateId === r.id ? C.orange : C.border}` }}>
                <div>
                  <div className="text-sm font-semibold" style={{ color: C.text }}>{r.label}</div>
                  <div className="text-xs" style={{ color: C.sub }}>{r.cycle}</div>
                </div>
                <div className="font-mono font-bold" style={{ color: C.orange }}>${r.amount}</div>
              </button>
            ))}
          </div>
        )}
        <Btn className="w-full" disabled={!invoiceRateId} onClick={() => assignBilling(invoiceAthleteId, invoiceRateId)} icon={Check}>Assign & Activate</Btn>
        <div className="mt-3 text-xs text-center" style={{ color: C.faint }}>
          Payment links will direct clients to your {payments.methods.join(" / ") || "preferred payment method"}.
        </div>
      </Modal>
    </div>
  );
}

function CoachMessages({ state, setState, nav }) {
  const [activeId, setActiveId] = useState(state.athletes[0]?.id);
  const [draft, setDraft] = useState("");
  const active = state.athletes.find(a => a.id === activeId);
  const thread = state.messages[activeId] || [];
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread.length, activeId]);

  const send = () => {
    if (!draft.trim()) return;
    setState(s => ({ ...s, messages: { ...s.messages, [activeId]: [...(s.messages[activeId] || []), { id: "m" + Date.now(), from: "coach", text: draft, time: "Now" }] } }));
    setDraft("");
  };

  return (
    <div className="flex flex-col h-screen pb-16">
      <TopBar title="Messages" onLogout={nav.logout} />
      <div className="flex gap-2 px-3 py-3 overflow-x-auto shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        {state.athletes.map(a => (
          <button key={a.id} onClick={() => setActiveId(a.id)} className="flex flex-col items-center gap-1 shrink-0 px-1">
            <Avatar initials={a.avatar} size={44} accent={activeId === a.id ? C.orange : "#5C6066"} />
            <span className="text-[10px] truncate max-w-[60px]" style={{ color: activeId === a.id ? C.text : C.sub }}>{a.name.split(" ")[0]}</span>
          </button>
        ))}
      </div>
      {state.athletes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <div>
            <div className="text-sm font-semibold mb-1" style={{ color: C.text }}>No athletes yet</div>
            <p className="text-xs" style={{ color: C.sub }}>Once someone accepts your invite and joins your roster, you'll be able to message them here.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {thread.length === 0 && <div className="text-center text-sm mt-10" style={{ color: C.faint }}>No messages yet with {active?.name}.</div>}
            {thread.map(m => (
              <div key={m.id} className={`flex ${m.from === "coach" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[75%] rounded-2xl px-3.5 py-2.5" style={{ background: m.from === "coach" ? C.orange : C.panel, color: m.from === "coach" ? "#fff" : C.text, border: m.from === "coach" ? "none" : `1px solid ${C.border}` }}>
                  <div className="text-sm">{m.text}</div>
                  <div className="text-[10px] mt-1 opacity-70">{m.time}</div>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="flex items-center gap-2 px-4 py-3 shrink-0" style={{ borderTop: `1px solid ${C.border}` }}>
            <input style={{ ...inputStyle, flex: 1 }} placeholder="Message..." value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} />
            <button onClick={send} className="rounded-full p-2.5 shrink-0" style={{ background: C.orange }}><Send size={18} style={{ color: "#fff" }} /></button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// COACH PROFILE — roster-wide statistics hub
// ============================================================

function CoachProfile({ state, setState, nav }) {
  const totalAthletes = state.athletes.length;
  const activePrograms = state.programs.length;
  const totalSessions = state.workoutLogs.length;
  const injuredCount = state.athletes.filter(a => a.injuries?.length > 0).length;
  const unassigned = state.athletes.filter(a => !a.program && !a.customProgram).length;
  const mostActive = [...state.athletes].sort((a, b) => (b.streak || 0) - (a.streak || 0))[0];
  const coach = state.coachProfile || { name: "Coach", avatar: "CO", photoUrl: null, accountabilityEnabled: true };
  const accountabilityOn = coach.accountabilityEnabled !== false;

  const setPhoto = (dataUrl) => setState(s => ({ ...s, coachProfile: { ...(s.coachProfile || {}), photoUrl: dataUrl } }));
  const toggleAccountability = () => setState(s => ({ ...s, coachProfile: { ...(s.coachProfile || {}), accountabilityEnabled: !accountabilityOn } }));

  // Today's checkins across all athletes
  const today = todayISO();
  const checkins = state.sessionCheckins || {};
  const todayCheckin = checkins[today];
  const confirmedToday = todayCheckin?.confirmed;

  return (
    <div className="pb-28">
      <TopBar title="Profile" onLogout={nav.logout} />
      <div className="px-5 pt-5">
        <div className="flex flex-col items-center mb-6">
          <EditableAvatar initials={coach.avatar} size={84} photoUrl={coach.photoUrl} onChange={setPhoto} />
          <div className="text-xl font-bold mt-3 text-center" style={{ fontFamily: "Inter", color: C.text }}>{coach.name}</div>
          <div className="text-sm" style={{ color: C.sub }}>{totalAthletes} athletes · {activePrograms} programs</div>
        </div>

        {/* Accountability Toggle */}
        <div className="rounded-xl p-4 mb-5" style={{ background: C.panel, border: `1px solid ${accountabilityOn ? C.orange : C.border}` }}>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold" style={{ color: C.text }}>Accountability Mode</div>
              <div className="text-xs mt-0.5" style={{ color: C.sub }}>
                {accountabilityOn ? "Athletes must check off sessions · Reminders active" : "Session check-offs disabled · No reminders"}
              </div>
            </div>
            <button onClick={toggleAccountability} className="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors"
              style={{ background: accountabilityOn ? C.orange : C.border }}>
              <span className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5"
                style={{ transform: accountabilityOn ? "translateX(22px)" : "translateX(2px)" }} />
            </button>
          </div>
        </div>

        {/* Checkin status — today's roster */}
        {accountabilityOn && (
          <div className="rounded-xl p-4 mb-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="text-xs uppercase tracking-wide font-semibold mb-3" style={{ color: C.sub }}>Today's Check-ins</div>
            {state.athletes.length === 0 ? (
              <div className="text-sm text-center py-3" style={{ color: C.faint }}>No athletes yet.</div>
            ) : (
              <div className="space-y-2">
                {state.athletes.map(a => {
                  const prog = a.customProgram || state.programs.find(p => p.id === a.program);
                  const hasSession = !!prog;
                  // In prototype, use the shared checkin for all athletes — in prod this would be per-athlete
                  const checked = confirmedToday && hasSession;
                  return (
                    <div key={a.id} className="flex items-center gap-3 rounded-lg p-2.5" style={{ background: C.bg }}>
                      <Avatar initials={a.avatar} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: C.text }}>{a.name}</div>
                        <div className="text-xs" style={{ color: C.sub }}>{hasSession ? prog.days[0]?.name || "Rest day" : "No program"}</div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        {!hasSession ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: C.border, color: C.faint }}>No Program</span>
                        ) : checked ? (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${C.olive}22`, color: C.olive }}>
                            <CheckCircle2 size={11} /> Done
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${C.amber}22`, color: C.amber }}>Pending</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>Roster Overview</div>
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <StatCard icon={Users} label="Athletes" value={totalAthletes} accent={C.orange} />
          <StatCard icon={ClipboardList} label="Programs" value={activePrograms} accent={C.blue} />
          <StatCard icon={Dumbbell} label="Sessions Logged" value={totalSessions} accent={C.olive} />
        </div>
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <StatCard icon={AlertCircle} label="Flagged Injuries" value={injuredCount} accent={C.red} />
          <StatCard icon={Target} label="Unassigned" value={unassigned} accent={C.amber} />
        </div>

        {mostActive && mostActive.streak > 0 && (
          <>
            <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>Top Streak</div>
            <button onClick={() => nav.go("coach-athlete-detail", mostActive.id)} className="w-full rounded-xl p-3.5 flex items-center gap-3 text-left mb-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <Avatar initials={mostActive.avatar} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate" style={{ color: C.text }}>{mostActive.name}</div>
                <div className="text-xs truncate" style={{ color: C.sub }}>{mostActive.sport}</div>
              </div>
              <div className="flex items-center gap-1 text-sm font-mono font-bold shrink-0" style={{ color: C.amber }}><Flame size={15} />{mostActive.streak}</div>
            </button>
          </>
        )}

        <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>More</div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <button onClick={() => nav.go("coach-athletes")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.orange}22` }}><Users size={18} style={{ color: C.orange }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>All Athletes</span>
          </button>
          <button onClick={() => nav.go("coach-programs")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.blue}22` }}><ClipboardList size={18} style={{ color: C.blue }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Programs</span>
          </button>
          <button onClick={() => nav.go("exercise-library")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.olive}22` }}><BookOpen size={18} style={{ color: C.olive }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Exercise Library</span>
          </button>
          <button onClick={() => nav.go("calendar")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.amber}22` }}><Calendar size={18} style={{ color: C.amber }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Calendar</span>
          </button>
        </div>

        <ChalkDivider label="Roster" />
        <div className="space-y-2">
          {state.athletes.map(a => (
            <button key={a.id} onClick={() => nav.go("coach-athlete-detail", a.id)} className="w-full rounded-lg p-3 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <Avatar initials={a.avatar} size={32} />
              <span className="text-sm flex-1 min-w-0 truncate" style={{ color: C.text }}>{a.name}</span>
              <span className="text-xs font-mono shrink-0" style={{ color: C.sub }}>{a.streak}d streak</span>
            </button>
          ))}
        </div>

        <Btn variant="danger" className="w-full mt-6" icon={LogOut} onClick={nav.logout}>Log Out</Btn>
      </div>
    </div>
  );
}

// ============================================================
// ATHLETE PORTAL
// ============================================================

function AthleteDashboard({ state, setState, nav }) {
  const myProgram = state.me.customProgram || state.programs.find(p => p.id === state.me.program);
  const todayDay = myProgram?.days[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const accountabilityOn = state.coachProfile?.accountabilityEnabled !== false;
  const today = todayISO();
  const checkins = state.sessionCheckins || {};
  const todayCheckin = checkins[today];
  const alreadyCheckedIn = todayCheckin?.confirmed;

  const confirmCheckin = () => {
    setState(s => ({
      ...s,
      sessionCheckins: {
        ...s.sessionCheckins,
        [today]: { confirmed: true, programDay: todayDay?.name || "Session", confirmedAt: new Date().toLocaleTimeString() }
      }
    }));
  };

  // Build reminder banners
  const reminders = [];
  if (myProgram) {
    const totalDays = myProgram.days?.length || 0;
    const logCount = (state.workoutLogs || []).length;

    // Session today — needs check-in
    if (accountabilityOn && todayDay && !alreadyCheckedIn) {
      reminders.push({ type: "session", icon: "💪", text: `You have a session today — ${todayDay.name}`, color: C.orange });
    }
    // Program starting (first log)
    if (logCount === 0 && myProgram) {
      reminders.push({ type: "start", icon: "🚀", text: `${myProgram.name} is ready to begin. Hit Start Workout to kick things off.`, color: C.blue });
    }
    // Program ending — last 2 sessions
    if (logCount >= totalDays * (myProgram.weeks || 4) - 2 && logCount > 0) {
      reminders.push({ type: "end", icon: "🏁", text: "You're in the final stretch of your program — finish strong!", color: C.amber });
    }
  }

  return (
    <div className="pb-28">
      <div className="px-5 pt-6 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base" style={{ color: C.sub }}>{greeting} 👋</div>
          <div className="text-3xl mt-0.5 truncate" style={{ fontFamily: "Inter", fontWeight: 800, color: C.text }}>{state.me.name.split(" ")[0]}</div>
        </div>
        <button onClick={nav.logout} className="flex items-center gap-1.5 rounded-full px-3 py-2 shrink-0" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <Flame size={14} style={{ color: C.amber }} />
          <span className="text-sm font-bold font-mono" style={{ color: C.text }}>{state.me.streak}</span>
          <span className="text-xs" style={{ color: C.sub }}>day streak</span>
        </button>
      </div>

      <div className="px-5 pt-4">
        {/* Reminder banners */}
        {reminders.length > 0 && (
          <div className="space-y-2.5 mb-5">
            {reminders.map((r, i) => (
              <div key={i} className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: `${r.color}18`, border: `1px solid ${r.color}55` }}>
                <span className="text-lg shrink-0">{r.icon}</span>
                <span className="text-sm" style={{ color: C.text }}>{r.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Session check-off — only when accountability is on */}
        {accountabilityOn && todayDay && (
          <div className="rounded-xl p-4 mb-5" style={{ background: alreadyCheckedIn ? `${C.olive}18` : `${C.orange}12`, border: `1px solid ${alreadyCheckedIn ? C.olive : C.orange}55` }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: alreadyCheckedIn ? C.olive : C.text }}>
                  {alreadyCheckedIn ? "✅ Session confirmed!" : "📋 Session check-in required"}
                </div>
                <div className="text-xs mt-0.5" style={{ color: C.sub }}>
                  {alreadyCheckedIn
                    ? `Checked in at ${todayCheckin.confirmedAt}`
                    : "Your coach requires you to confirm completed sessions."}
                </div>
              </div>
              {!alreadyCheckedIn && (
                <button onClick={confirmCheckin} className="rounded-full px-3 py-2 text-xs font-semibold shrink-0"
                  style={{ background: C.orange, color: "#fff" }}>
                  Confirm
                </button>
              )}
            </div>
          </div>
        )}
        {todayDay ? (
          <div className="relative w-full text-left rounded-3xl p-6 mb-6 overflow-hidden" style={{ background: `linear-gradient(135deg, ${C.gradFrom}, ${C.gradTo})` }}>
            <div className="absolute rounded-full" style={{ width: 200, height: 200, right: -60, top: -60, background: "#ffffff14" }} />
            <div className="text-xs font-semibold uppercase tracking-wider relative" style={{ color: "#ffffffb0" }}>Today's Focus</div>
            <div className="text-3xl mt-1.5 truncate relative" style={{ fontFamily: "Inter", fontWeight: 800, color: "#fff" }}>{todayDay.name}</div>
            <div className="text-sm mt-1 relative" style={{ color: "#ffffffcc" }}>{todayDay.exercises.length} exercises</div>
            <button onClick={() => nav.go("athlete-workout")} className="relative mt-5 inline-flex items-center gap-2 rounded-full px-5 py-3 font-semibold text-sm" style={{ background: "#fff", color: C.orange }}>
              <Play size={15} fill={C.orange} /> Start Workout
            </button>
          </div>
        ) : (
          <div className="rounded-3xl p-6 mb-6 text-center" style={{ background: C.panel, border: `1px dashed ${C.border}` }}>
            {state.me.selfGuided ? (
              <>
                <div className="text-sm font-semibold mb-1" style={{ color: C.text }}>Setting up your program</div>
                <p className="text-xs" style={{ color: C.sub }}>Your AI-generated program is being built from your intake. It'll appear here shortly.</p>
              </>
            ) : (
              <p className="text-sm" style={{ color: C.sub }}>Waiting on your coach to assign a program.</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2.5 mb-6">
          <StatCard icon={Dumbbell} label="Workouts" value={state.workoutLogs.length} accent={C.orange} />
          <StatCard icon={Salad} label="Calories" value="0" sub="kcal" accent={C.olive} />
          <StatCard icon={Zap} label="Protein" value="0" sub="g" accent={C.amber} />
        </div>

        {/* Accountability — weekly completion tracker */}
        {(() => {
          const today = new Date();
          const dayOfWeek = today.getDay(); // 0=Sun
          const weekDays = Array.from({length: 7}, (_, i) => {
            const d = new Date(today);
            d.setDate(today.getDate() - dayOfWeek + i);
            return d;
          });
          const loggedDates = new Set(state.workoutLogs.map(l => l.date));
          const dayLabels = ["S","M","T","W","T","F","S"];
          const completed = weekDays.filter(d => loggedDates.has(d.toISOString().slice(0,10))).length;
          const target = state.me.daysPerWeek || 4;
          return (
            <div className="rounded-2xl p-4 mb-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold" style={{ color: C.text }}>This Week</div>
                <div className="text-xs font-mono" style={{ color: completed >= target ? C.olive : C.sub }}>{completed}/{target} sessions</div>
              </div>
              <div className="flex gap-1.5 justify-between">
                {weekDays.map((d, i) => {
                  const iso = d.toISOString().slice(0,10);
                  const done = loggedDates.has(iso);
                  const isToday = i === dayOfWeek;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-[9px]" style={{ color: isToday ? C.orange : C.faint }}>{dayLabels[i]}</div>
                      <div className="w-full aspect-square rounded-lg flex items-center justify-center"
                        style={{ background: done ? C.olive : isToday ? `${C.orange}22` : C.border, border: isToday ? `1px solid ${C.orange}55` : "none" }}>
                        {done && <CheckCircle2 size={12} style={{ color: "#fff" }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
              {completed >= target && (
                <div className="mt-3 text-center text-xs font-semibold" style={{ color: C.olive }}>🔥 Weekly goal hit! Keep going.</div>
              )}
            </div>
          );
        })()}

        <div className="text-lg mb-3" style={{ fontFamily: "Inter", fontWeight: 800, color: C.text }}>Quick Access</div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button onClick={() => nav.go("calendar")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.orange}22` }}><Calendar size={18} style={{ color: C.orange }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Calendar</span>
          </button>
          <button onClick={() => nav.go("nutrition")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.olive}22` }}><Salad size={18} style={{ color: C.olive }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Nutrition</span>
          </button>
          <button onClick={() => nav.go("athlete-progress")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.blue}22` }}><TrendingUp size={18} style={{ color: C.blue }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Progress</span>
          </button>
          <button onClick={() => nav.go("exercise-library")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.amber}22` }}><BookOpen size={18} style={{ color: C.amber }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Exercise Library</span>
          </button>
        </div>

        <ChalkDivider label="Recent Sessions" />
        <div className="space-y-2.5">
          {state.workoutLogs.map(l => (
            <div key={l.id} className="rounded-xl p-3.5 flex items-center gap-3" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <div className="rounded-lg p-2 shrink-0" style={{ background: C.border }}><CheckCircle2 size={18} style={{ color: C.olive }} /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: C.text }}>{l.programDay}</div>
                <div className="text-xs" style={{ color: C.sub }}>{formatLogDate(l.date)} · {l.duration} min</div>
              </div>
            </div>

          ))}
        </div>
      </div>
    </div>
  );
}

function AthleteProgram({ state, setState, nav }) {
  const myProgram = state.me.customProgram || state.programs.find(p => p.id === state.me.program);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [swapTarget, setSwapTarget] = useState(null);
  const exById = id => state.exercises.find(e => e.id === id);

  if (!myProgram) {
    return (
      <div className="pb-28">
        <TopBar title="My Program" onLogout={nav.logout} />
        <div className="px-5 pt-10 text-center">
          {state.me.selfGuided
            ? <><div className="text-sm font-semibold mb-1" style={{ color: C.text }}>Your program is being built</div><p className="text-xs" style={{ color: C.sub }}>Your AI-generated plan will appear here once it's ready.</p></>
            : <p className="text-sm" style={{ color: C.sub }}>Waiting on your coach to assign a program.</p>
          }
        </div>
      </div>
    );
  }

  const day = myProgram.days[activeDayIdx];
  // Order is set once at generation/build time (phase sequence) and persists here —
  // NOT re-sorted on every render — so a manual reorder below actually sticks.
  const sortedExercises = day ? day.exercises : [];

  const swapExerciseInMyProgram = (dayId, xId, newExercise) => {
    const isCustom = !!state.me.customProgram;
    const updateDays = (prog) => ({
      ...prog,
      days: prog.days.map(d => d.id === dayId
        ? { ...d, exercises: d.exercises.map(x => x.id === xId ? { ...x, exerciseId: newExercise.id, phase: newExercise.phase } : x) }
        : d)
    });
    if (isCustom) {
      const updated = updateDays(state.me.customProgram);
      setState(s => ({ ...s, me: { ...s.me, customProgram: updated } }));
    } else {
      const updated = updateDays(myProgram);
      setState(s => ({ ...s, programs: s.programs.map(p => p.id === myProgram.id ? updated : p) }));
      if (state.me.id) updateProgramRow(myProgram.id, updated.days, state);
    }
  };

  const moveExercise = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= sortedExercises.length) return;
    const isCustom = !!state.me.customProgram;
    const updateDays = (prog) => ({
      ...prog,
      days: prog.days.map((d, i) => {
        if (i !== activeDayIdx) return d;
        const next = [...d.exercises];
        [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
        return { ...d, exercises: next };
      })
    });
    if (isCustom) {
      const updated = updateDays(state.me.customProgram);
      setState(s => ({ ...s, me: { ...s.me, customProgram: updated } }));
    } else {
      const updated = updateDays(myProgram);
      setState(s => ({ ...s, programs: s.programs.map(p => p.id === myProgram.id ? updated : p) }));
      if (state.me.id) updateProgramRow(myProgram.id, updated.days, state);
    }
  };

  return (
    <div className="pb-28">
      <div className="px-5 pt-6 pb-2">
        <div className="text-2xl" style={{ fontFamily: "Inter", fontWeight: 800, color: C.text }}>My Program</div>
        <div className="text-sm mt-0.5" style={{ color: C.sub }}>AI-generated for your goals</div>
      </div>

      <div className="px-5 pt-4">
        <div className="relative rounded-3xl p-6 mb-5 overflow-hidden" style={{ background: `linear-gradient(135deg, ${C.gradFrom}, ${C.gradTo})` }}>
          <div className="absolute rounded-full" style={{ width: 180, height: 180, right: -50, top: -50, background: "#ffffff14" }} />
          <div className="text-xs font-semibold uppercase tracking-wider relative" style={{ color: "#ffffffb0" }}>Active Program</div>
          <div className="text-2xl mt-1.5 relative" style={{ fontFamily: "Inter", fontWeight: 800, color: "#fff" }}>{myProgram.name}</div>
          <div className="text-sm mt-2 relative leading-relaxed" style={{ color: "#ffffffd0" }}>
            {myProgram.weeks}-week program with {myProgram.days.length} training days per cycle, built around {state.me.goals?.join(" + ") || "your goals"}.
          </div>
          <div className="flex items-center gap-4 mt-4 relative text-sm" style={{ color: "#ffffffcc" }}>
            <span className="flex items-center gap-1.5"><Clock size={14} /> 60min sessions</span>
            <span className="flex items-center gap-1.5"><RefreshCw size={14} /> {myProgram.days.length}x per week</span>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {myProgram.days.map((d, i) => (
            <button key={d.id} onClick={() => setActiveDayIdx(i)} className="shrink-0 rounded-2xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap"
              style={{ background: activeDayIdx === i ? C.orange : C.panel, color: activeDayIdx === i ? "#fff" : C.sub, border: `1px solid ${activeDayIdx === i ? C.orange : C.border}` }}>
              {d.name.split("—")[0].trim()}
            </button>
          ))}
        </div>

        {day && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xl" style={{ fontFamily: "Inter", fontWeight: 800, color: C.text }}>{day.name}</div>
                <div className="text-sm mt-0.5" style={{ color: C.orange }}>{sortedExercises.length} exercises</div>
              </div>
              <button onClick={() => nav.go("athlete-workout")} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 font-semibold text-sm shrink-0" style={{ background: C.orange, color: "#fff" }}>
                <Play size={14} fill="#fff" /> Start
              </button>
            </div>

            <div className="space-y-2">
              {sortedExercises.map((x, i) => {
                const ex = exById(x.exerciseId);
                const phaseLabel = PHASES.find(p => p.key === x.phase)?.short;
                return (
                  <div key={x.id} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div className="rounded-xl w-11 h-11 flex items-center justify-center shrink-0 overflow-hidden" style={{ background: `linear-gradient(135deg, ${C.gradFrom}, ${C.gradTo})` }}>
                      {exerciseImage(ex?.name) ? <img src={exerciseImage(ex.name)} alt={ex.name} className="w-full h-full object-cover" /> : <span className="text-sm font-bold text-white">{i + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: C.text }}>{ex?.name}</div>
                      <div className="text-xs font-mono mt-0.5" style={{ color: C.sub }}>{phaseLabel} · {x.sets}×{x.reps} · RPE {x.rpe}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setSwapTarget({ dayId: day.id, x })} className="p-1.5" aria-label="Swap exercise">
                        <RotateCcw size={15} style={{ color: C.blue }} />
                      </button>
                      <div className="flex flex-col">
                        <button onClick={() => moveExercise(i, i - 1)} disabled={i === 0} className="p-1 disabled:opacity-25" aria-label="Move up">
                          <ChevronUp size={16} style={{ color: C.sub }} />
                        </button>
                        <button onClick={() => moveExercise(i, i + 1)} disabled={i === sortedExercises.length - 1} className="p-1 disabled:opacity-25" aria-label="Move down">
                          <ChevronDown size={16} style={{ color: C.sub }} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <ExerciseSwapModal open={!!swapTarget} onClose={() => setSwapTarget(null)} currentExercise={swapTarget?.x} exercises={state.exercises}
        onSwap={(newEx) => swapExerciseInMyProgram(swapTarget.dayId, swapTarget.x.id, newEx)} />
    </div>
  );
}

function RestTimer({ seconds, onDone }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) { onDone?.(); return; }
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const pct = Math.max(0, left / seconds);
  return (
    <div className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.sub }}>Rest Timer</span>
        <span className="font-mono font-bold" style={{ color: C.orange }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
      </div>
      <div className="relative h-6 rounded-full overflow-hidden" style={{ background: C.bg }}>
        <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${(1 - pct) * 100}%`, background: `linear-gradient(90deg, ${C.gradFrom}, ${C.gradTo})` }} />
        {[0.2, 0.4, 0.6, 0.8].map(p => <div key={p} className="absolute top-0 bottom-0 w-0.5" style={{ left: `${p * 100}%`, background: "#00000066" }} />)}
      </div>
    </div>
  );
}

function Workout({ state, setState, nav }) {
  const myProgram = state.me.customProgram || state.programs.find(p => p.id === state.me.program);
  const day = myProgram?.days[0];
  const exById = id => state.exercises.find(e => e.id === id);
  const sortedExercises = useMemo(() => day ? day.exercises : [], [day]);

  const [exIdx, setExIdx] = useState(0);
  const [setChecks, setSetChecks] = useState({});
  const [resting, setResting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [mood, setMood] = useState(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swappedMap, setSwappedMap] = useState({});
  const [showGenerator, setShowGenerator] = useState(false);

  if (!day) return (
    <div className="pb-28">
      <TopBar title="Workout" onLogout={nav.logout} />
      <div className="px-5 pt-10 text-center">
        {state.me.selfGuided
          ? (
            <>
              <div className="text-sm font-semibold mb-1" style={{ color: C.text }}>No program yet</div>
              <p className="text-xs mb-5" style={{ color: C.sub }}>Generate a fully comprehensive program based on your sign-up screening.</p>
              <Btn icon={Sparkles} onClick={() => setShowGenerator(true)}>Generate Program</Btn>
            </>
          )
          : <p className="text-sm" style={{ color: C.sub }}>Waiting on your coach to assign a program.</p>
        }
      </div>
      {showGenerator && (
        <AIProgramGenerator
          intake={state.me.intake || {}}
          onClose={() => setShowGenerator(false)}
          onGenerated={async (result) => {
            const weeks = result.weeks || 6;
            const sport = state.me.intake?.["🥊 Sport / Focus"] || "General Fitness";
            const dbId = state.me.id ? await createProgramRow(state.me.id, result.programName, weeks, sport, result.days) : null;
            setState(s => applyGeneratedProgram(result, s, state.me.intake, dbId));
            setShowGenerator(false);
          }}
        />
      )}
    </div>
  );

  const x = sortedExercises[exIdx];
  const ex = x && exById(swappedMap[x.id] || x.exerciseId);
  const totalSets = x?.sets || 0;
  const doneSets = setChecks[x?.id]?.length || 0;
  const phaseLabel = PHASES.find(p => p.key === x?.phase)?.label;

  const toggleSet = (setNum) => {
    setSetChecks(sc => {
      const cur = sc[x.id] || [];
      const next = cur.includes(setNum) ? cur.filter(n => n !== setNum) : [...cur, setNum];
      return { ...sc, [x.id]: next };
    });
    if (!(setChecks[x.id] || []).includes(setNum)) { setResting(true); setTimeout(() => setResting(false), 100); }
  };

  const finishWorkout = () => {
    setState(s => ({ ...s, workoutLogs: [{ id: "l" + Date.now(), date: todayISO(), programDay: day.name, duration: 52, mood }, ...s.workoutLogs] }));
    if (state.me.id) supabase.from("workout_logs").insert({ user_id: state.me.id, date: todayISO(), program_day: day.name, duration: 52, mood });
    setFinished(true);
  };

  if (finished) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: C.bg }}>
        <Trophy size={48} style={{ color: C.orange }} />
        <h2 className="text-2xl font-bold mt-4 text-center" style={{ fontFamily: "Inter", color: C.text }}>SESSION LOGGED</h2>
        <p className="text-sm mt-1 text-center" style={{ color: C.sub }}>{day.name} complete. Nice work.</p>
        <Btn className="mt-8" onClick={() => nav.go("athlete-dashboard")}>Back to Dashboard</Btn>
      </div>
    );
  }

  return (
    <div className="pb-36">
      <TopBar title={day.name} right={<span className="text-xs font-mono shrink-0" style={{ color: C.sub }}>{exIdx + 1}/{sortedExercises.length}</span>} />
      <div className="px-5 pt-5">
        <div className="rounded-2xl overflow-hidden mb-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          {exerciseImage(ex?.name)
            ? <img src={exerciseImage(ex.name)} alt={ex.name} className="w-full h-44 object-cover" />
            : (
              <div className="w-full h-44 flex flex-col items-center justify-center gap-2 relative overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${C.steel}99, ${C.bg})` }}>
                <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 70% 30%, ${C.orange}22, transparent 60%)` }} />
                <Dumbbell size={36} style={{ color: `${C.orange}aa` }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: `${C.orange}99` }}>{phaseLabel}</span>
              </div>
            )
          }
          <div className="p-5">
          <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: C.orange }}>{phaseLabel}</div>
          <div className="text-2xl font-bold mt-1" style={{ fontFamily: "Inter", color: C.text }}>{ex?.name}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 font-mono text-sm" style={{ color: C.orange }}>
            <span>{x.sets} sets</span><span>{x.reps} reps</span><span>RPE {x.rpe}</span><span>rest {x.rest}</span>
          </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 mb-5 overflow-x-auto">
          <PlateBadge value={doneSets} label="Done" accent={C.olive} />
          <PlateBadge value={totalSets} label="Target" />
          <PlateBadge value={x.rpe} label="Target RPE" accent={C.blue} />
        </div>

        <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.sub }}>Sets</div>
        <div className="space-y-2 mb-5">
          {Array.from({ length: totalSets }).map((_, i) => {
            const checked = (setChecks[x.id] || []).includes(i);
            return (
              <button key={i} onClick={() => toggleSet(i)} className="w-full flex items-center gap-3 rounded-lg p-3" style={{ background: checked ? `${C.olive}18` : C.panel, border: `1px solid ${checked ? C.olive : C.border}` }}>
                {checked ? <CheckCircle2 size={20} style={{ color: C.olive }} /> : <Circle size={20} style={{ color: C.faint }} />}
                <span className="text-sm font-medium" style={{ color: C.text }}>Set {i + 1}</span>
                <span className="ml-auto font-mono text-sm shrink-0" style={{ color: C.sub }}>{x.reps} reps · RPE {x.rpe}</span>
              </button>
            );
          })}
        </div>

        {resting && <RestTimer seconds={5} onDone={() => setResting(false)} />}

        <ChalkDivider />
        <Btn variant="ghost" icon={RotateCcw} onClick={() => setSwapOpen(true)}>Swap This Exercise</Btn>
      </div>

      <div className="fixed bottom-16 left-0 right-0 px-5 py-4 flex gap-3" style={{ background: `${C.bg}ee`, backdropFilter: "blur(8px)", borderTop: `1px solid ${C.border}` }}>
        {exIdx > 0 && <Btn variant="secondary" onClick={() => setExIdx(i => i - 1)} icon={ChevronLeft}>Back</Btn>}
        {exIdx < sortedExercises.length - 1
          ? <Btn className="flex-1" onClick={() => setExIdx(i => i + 1)} icon={ChevronRight}>Next Exercise</Btn>
          : <Btn className="flex-1" onClick={() => setMood("ask")}>Finish Workout</Btn>}
      </div>

      <ExerciseSwapModal open={swapOpen} onClose={() => setSwapOpen(false)} currentExercise={{ exerciseId: ex?.id }} exercises={state.exercises}
        onSwap={(newEx) => setSwappedMap(m => ({ ...m, [x.id]: newEx.id }))} reasonPreset="" />

      <Modal open={mood === "ask"} onClose={() => setMood(null)} title="How'd that feel?">
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {[["tough", "😤", "Tough"], ["good", "💪", "Good"], ["strong", "🔥", "Strong"]].map(([key, emoji, label]) => (
            <button key={key} onClick={() => setMood(key)} className="rounded-xl p-4 text-center" style={{ background: mood === key ? `${C.orange}18` : C.bg, border: `1px solid ${mood === key ? C.orange : C.border}` }}>
              <div className="text-2xl">{emoji}</div>
              <div className="text-xs mt-1.5" style={{ color: C.text }}>{label}</div>
            </button>
          ))}
        </div>
        <Btn className="w-full" disabled={!mood || mood === "ask"} onClick={finishWorkout}>Log Session</Btn>
      </Modal>
    </div>
  );
}

function AthleteProgress({ state, setState, nav }) {
  const [logOpen, setLogOpen] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [unit, setUnit] = useState("lb");
  const data = state.progress;
  const display = kg => unit === "lb" ? kgToLb(kg) : kg;

  const logEntry = () => {
    if (!weightInput) return;
    const kg = unit === "lb" ? lbToKg(parseFloat(weightInput)) : parseFloat(weightInput);
    setState(s => ({ ...s, progress: [...s.progress, { date: "Today", weightKg: kg, bodyFat: null }] }));
    if (state.me.id) supabase.from("progress_entries").insert({ user_id: state.me.id, weight_kg: kg, body_fat: null });
    setWeightInput(""); setLogOpen(false);
  };

  if (data.length === 0) {
    return (
      <div className="pb-28">
        <TopBar title="Progress" onLogout={nav.logout} right={<button onClick={() => setLogOpen(true)}><Plus size={20} style={{ color: C.orange }} /></button>} />
        <div className="px-5 pt-10 text-center">
          <div className="text-sm font-semibold mb-1" style={{ color: C.text }}>No entries yet</div>
          <p className="text-xs mb-5" style={{ color: C.sub }}>Log your weight to start tracking progress over time.</p>
          <Btn icon={Plus} onClick={() => setLogOpen(true)}>Log Entry</Btn>
        </div>
        <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Log Weight">
          <Field label={`Weight (${unit})`}>
            <input type="number" style={inputStyle} value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder="0" />
          </Field>
          <Btn className="w-full mt-2" onClick={logEntry}>Save Entry</Btn>
        </Modal>
      </div>
    );
  }

  const maxW = Math.max(...data.map(d => d.weightKg));
  const minW = Math.min(...data.map(d => d.weightKg));

  return (
    <div className="pb-28">
      <TopBar title="Progress" onLogout={nav.logout} right={<button onClick={() => setLogOpen(true)}><Plus size={20} style={{ color: C.orange }} /></button>} />
      <div className="px-5 pt-5">
        <div className="flex justify-end mb-3"><UnitToggle value={unit} options={["lb", "kg"]} onChange={setUnit} /></div>
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          <StatCard icon={TrendingUp} label="Current Weight" value={display(data[data.length - 1].weightKg)} sub={unit} />
          <StatCard icon={Activity} label="Body Fat" value={`${data[data.length - 1].bodyFat ?? "—"}%`} accent={C.blue} />
        </div>

        <div className="rounded-xl p-4 mb-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <div className="text-xs uppercase tracking-wide font-semibold mb-4" style={{ color: C.sub }}>Weight Trend</div>
          <div className="flex items-end gap-2 h-32">
            {data.map((d, i) => {
              const h = ((d.weightKg - minW + 1) / (maxW - minW + 2)) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full rounded-t-md transition-all" style={{ height: `${h}%`, background: i === data.length - 1 ? C.orange : C.steel }} />
                  <span className="text-[9px]" style={{ color: C.faint }}>{d.date.split(" ")[1] || d.date}</span>
                </div>
              );
            })}
          </div>
        </div>

        <ChalkDivider label="Log History" />
        <div className="space-y-2">
          {[...data].reverse().map((d, i) => (
            <div key={i} className="rounded-lg p-3 flex justify-between items-center" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <span className="text-sm" style={{ color: C.text }}>{d.date}</span>
              <span className="font-mono text-sm" style={{ color: C.sub }}>{display(d.weightKg)} {unit}{d.bodyFat ? ` · ${d.bodyFat}%` : ""}</span>
            </div>
          ))}
        </div>
      </div>

      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Log Body Metrics">
        <div className="flex justify-end mb-3"><UnitToggle value={unit} options={["lb", "kg"]} onChange={setUnit} /></div>
        <Field label={`Weight (${unit})`}><input style={inputStyle} type="number" value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder={unit === "lb" ? "175" : "79"} /></Field>
        <Btn className="w-full" onClick={logEntry}>Save Entry</Btn>
      </Modal>
    </div>
  );
}

// Combined messages page: tabs for Coach chat and AI Assistant
function AthleteMessages({ state, setState, nav }) {
  const [tab, setTab] = useState("ai");
  const myId = state.me.id;
  const coachThread = state.messages[myId] || [];
  const [draft, setDraft] = useState("");
  const [aiThread, setAiThread] = useState(state.aiThread || AI_SUGGESTED);
  const [aiLoading, setAiLoading] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [coachThread.length, aiThread.length, tab]);

  const sendCoach = () => {
    if (!draft.trim()) return;
    setState(s => ({ ...s, messages: { ...s.messages, [myId]: [...(s.messages[myId] || []), { id: "m" + Date.now(), from: "athlete", text: draft, time: "Now" }] } }));
    setDraft("");
  };

  const sendAI = async () => {
    if (!draft.trim()) return;
    const userMsg = { id: "m" + Date.now(), from: "athlete", text: draft, time: "Now" };
    const nextThread = [...aiThread, userMsg];
    setAiThread(nextThread);
    setDraft(""); setAiLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1000,
          messages: [
            { role: "user", content: `You are a knowledgeable, encouraging strength & conditioning AI assistant inside a coaching app. Keep responses concise (2-4 sentences) and practical. The athlete trains for ${state.me.sport}. Athlete asks: ${userMsg.text}` }
          ],
        })
      });
      const data = await response.json();
      const textBlock = (data.content || []).find(b => b.type === "text");
      const replyText = textBlock?.text || "Sorry, I couldn't generate a response just now.";
      setAiThread(t => [...t, { id: "m" + Date.now(), from: "ai", text: replyText, time: "Now" }]);
    } catch (err) {
      setAiThread(t => [...t, { id: "m" + Date.now(), from: "ai", text: "Something went wrong reaching the AI assistant — try again in a moment.", time: "Now" }]);
    } finally {
      setAiLoading(false);
    }
  };

  const thread = tab === "coach" ? coachThread : aiThread;

  return (
    <div className="flex flex-col h-screen pb-16">
      <TopBar title="Messages" onLogout={nav.logout} />
      <div className="flex gap-2 px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        <Pill active={tab === "coach"} onClick={() => setTab("coach")}>Coach Chat</Pill>
        <Pill active={tab === "ai"} onClick={() => setTab("ai")}><span className="flex items-center gap-1"><Bot size={12} />AI Assistant</span></Pill>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {thread.length === 0 && <div className="text-center text-sm mt-10" style={{ color: C.faint }}>{tab === "coach" ? "Message your coach to get started." : "Ask me anything about training."}</div>}
        {thread.map(m => (
          <div key={m.id} className={`flex ${m.from === "athlete" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%] rounded-2xl px-3.5 py-2.5" style={{
              background: m.from === "athlete" ? C.orange : (m.from === "ai" ? `${C.steel}55` : C.panel),
              color: m.from === "athlete" ? "#fff" : C.text,
              border: m.from === "athlete" ? "none" : `1px solid ${C.border}`
            }}>
              {m.from === "ai" && <div className="flex items-center gap-1 text-[10px] font-semibold mb-1" style={{ color: C.blue }}><Bot size={11} /> AI Assistant</div>}
              <div className="text-sm whitespace-pre-wrap">{m.text}</div>
              {m.time && <div className="text-[10px] mt-1 opacity-70">{m.time}</div>}
            </div>
          </div>
        ))}
        {aiLoading && tab === "ai" && (
          <div className="flex justify-start"><div className="rounded-2xl px-3.5 py-2.5" style={{ background: `${C.steel}55`, border: `1px solid ${C.border}` }}><Loader2 size={14} className="animate-spin" style={{ color: C.blue }} /></div></div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 px-4 py-3 shrink-0" style={{ borderTop: `1px solid ${C.border}` }}>
        {tab === "coach" && <button style={{ color: C.sub }} className="shrink-0"><ImageIcon size={20} /></button>}
        <input style={{ ...inputStyle, flex: 1 }} placeholder={tab === "coach" ? "Message your coach..." : "Ask the AI assistant..."} value={draft}
          onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && (tab === "coach" ? sendCoach() : sendAI())} />
        <button onClick={tab === "coach" ? sendCoach : sendAI} className="rounded-full p-2.5 shrink-0" style={{ background: C.orange }}><Send size={18} style={{ color: "#fff" }} /></button>
      </div>
    </div>
  );
}

function AthleteProfile({ state, setState, nav }) {
  const m = state.me;
  const { ft, inch } = cmToFtIn(m.heightCm);
  const latestProgress = state.progress[state.progress.length - 1];
  const firstProgress = state.progress[0];
  const weightChange = latestProgress && firstProgress ? (latestProgress.weightKg - firstProgress.weightKg) : 0;
  const totalMinutes = state.workoutLogs.reduce((sum, l) => sum + (l.duration || 0), 0);

  const setPhoto = (dataUrl) => setState(s => ({ ...s, me: { ...s.me, photoUrl: dataUrl } }));

  return (
    <div className="pb-28">
      <TopBar title="Profile" onLogout={nav.logout} />
      <div className="px-5 pt-5">
        <div className="flex flex-col items-center mb-6">
          <EditableAvatar initials={m.avatar} size={84} photoUrl={m.photoUrl} onChange={setPhoto} />
          <div className="text-xl font-bold mt-3 text-center" style={{ fontFamily: "Inter", color: C.text }}>{m.name}</div>
          <div className="text-sm" style={{ color: C.sub }}>{m.sport} · {m.sex === "male" ? "Male" : "Female"}</div>
          {m.goals?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5 justify-center">
              {m.goals.map(g => <span key={g} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${C.orange}22`, color: C.orange }}>{g}</span>)}
            </div>
          )}
        </div>

        <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>Training Stats</div>
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <StatCard icon={Flame} label="Streak" value={m.streak} sub="days" accent={C.amber} />
          <StatCard icon={Dumbbell} label="Logged" value={state.workoutLogs.length} sub="sessions" accent={C.blue} />
          <StatCard icon={Award} label="PRs" value={0} accent={C.olive} />
        </div>
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <StatCard icon={Clock} label="Time Trained" value={totalMinutes} sub="minutes" accent={C.orange} />
          <StatCard icon={TrendingUp} label="Weight Change" value={`${weightChange > 0 ? "+" : ""}${kgToLb(weightChange).toFixed(1)}`} sub="lb" accent={weightChange < 0 ? C.olive : C.amber} />
        </div>

        <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>Body Metrics</div>
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <StatCard icon={Ruler} label="📏 Height" value={`${ft}'${inch}"`} accent={C.amber} />
          <StatCard icon={Scale} label="⚖️ Weight" value={`${kgToLb(m.weightKg)} lb`} accent={C.amber} />
        </div>

        {m.injuries?.length > 0 && (
          <>
            <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>Injury Flags</div>
            <div className="rounded-lg p-3 mb-5 flex items-start gap-2" style={{ background: `${C.red}18`, border: `1px solid ${C.red}55` }}>
              <AlertCircle size={15} style={{ color: C.red }} className="mt-0.5 shrink-0" />
              <div className="text-xs" style={{ color: C.red }}>{m.injuries.join(", ")}</div>
            </div>
          </>
        )}

        <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>More</div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <button onClick={() => nav.go("athlete-progress")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.blue}22` }}><TrendingUp size={18} style={{ color: C.blue }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Full Progress</span>
          </button>
          <button onClick={() => nav.go("nutrition")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.olive}22` }}><Salad size={18} style={{ color: C.olive }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Nutrition</span>
          </button>
          <button onClick={() => nav.go("exercise-library")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.orange}22` }}><BookOpen size={18} style={{ color: C.orange }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Exercise Library</span>
          </button>
          <button onClick={() => nav.go("calendar")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.amber}22` }}><Calendar size={18} style={{ color: C.amber }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Calendar</span>
          </button>
        </div>

        <ChalkDivider label="Recent Sessions" />
        <div className="space-y-2">
          {state.workoutLogs.map(l => (
            <div key={l.id} className="rounded-lg p-3 flex justify-between gap-2" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <span className="text-sm truncate" style={{ color: C.text }}>{l.programDay}</span>
              <span className="text-xs font-mono shrink-0" style={{ color: C.sub }}>{formatLogDate(l.date)}</span>
            </div>
          ))}
        </div>
        <Btn variant="danger" className="w-full mt-6" icon={LogOut} onClick={nav.logout}>Log Out</Btn>
      </div>
    </div>
  );
}

// ============================================================
// SHARED PAGES
// ============================================================

function ExerciseDetailModal({ open, onClose, exercise }) {
  if (!exercise) return null;
  const img = exerciseImage(exercise.name);
  const phaseLabel = PHASES.find(p => p.key === exercise.phase)?.label || exercise.phase;
  const phaseColors = {
    warmup_general: "#5B8DEF", warmup_specific: "#9CAA7A", compound: "#3B6FED",
    explosive: "#F0A93C", hypertrophy: "#7FA8C9", lactic: "#FF6B6B", aerobic: "#34C77B", cooldown: "#9CAA7A"
  };
  const accent = phaseColors[exercise.phase] || C.orange;
  return (
    <Modal open={open} onClose={onClose} title="" wide>
      <div className="rounded-xl overflow-hidden mb-4 -mx-5 -mt-5" style={{ height: 220, background: `linear-gradient(135deg, ${accent}33, ${C.bg})` }}>
        {img
          ? <img src={img} alt={exercise.name} className="w-full h-full object-cover" />
          : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <Dumbbell size={40} style={{ color: accent }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>{phaseLabel}</span>
            </div>
          )}
      </div>
      <div className="mb-1 text-xl font-bold" style={{ fontFamily: "Inter", color: C.text }}>{exercise.name}</div>
      <div className="flex flex-wrap gap-2 mt-2 mb-4">
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: `${accent}22`, color: accent }}>{phaseLabel}</span>
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: `${C.border}`, color: C.sub }}>{exercise.pattern}</span>
        {exercise.injuryTag && <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: `${C.red}22`, color: C.red }}>⚠️ {exercise.injuryTag} care</span>}
      </div>
    </Modal>
  );
}

function AddExerciseModal({ open, onClose, onAdd }) {
  const [name, setName] = useState("");
  const [phase, setPhase] = useState(PHASES[0].key);
  const [pattern, setPattern] = useState(PATTERNS[0]);

  const reset = () => { setName(""); setPhase(PHASES[0].key); setPattern(PATTERNS[0]); };

  const submit = () => {
    if (!name.trim()) return;
    onAdd({ id: "ecustom" + Date.now(), name: name.trim(), phase, pattern, hasMedia: false });
    reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Add Exercise" wide>
      <Field label="Exercise name">
        <input style={inputStyle} placeholder="e.g. Trap Bar Jump" value={name} onChange={e => setName(e.target.value)} />
      </Field>
      <Field label="Phase">
        <div className="grid grid-cols-2 gap-2">
          {PHASES.map(p => (
            <button key={p.key} onClick={() => setPhase(p.key)} className="rounded-lg px-3 py-2.5 text-sm text-left"
              style={{ background: phase === p.key ? `${C.orange}18` : C.bg, border: `1px solid ${phase === p.key ? C.orange : C.border}`, color: phase === p.key ? C.orange : C.text }}>
              {p.short}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Movement pattern">
        <div className="grid grid-cols-2 gap-2">
          {PATTERNS.map(p => (
            <button key={p} onClick={() => setPattern(p)} className="rounded-lg px-3 py-2.5 text-xs text-left"
              style={{ background: pattern === p ? `${C.orange}18` : C.bg, border: `1px solid ${pattern === p ? C.orange : C.border}`, color: pattern === p ? C.orange : C.text }}>
              {p}
            </button>
          ))}
        </div>
      </Field>
      <Btn className="w-full" disabled={!name.trim()} onClick={submit} icon={Plus}>Add to Library</Btn>
    </Modal>
  );
}

function ExerciseLibraryPage({ state, setState, nav, isCoach }) {
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailExercise, setDetailExercise] = useState(null);

  const addExercise = (ex) => setState(s => ({ ...s, exercises: [...s.exercises, ex] }));
  const deleteExercise = (id) => {
    setState(s => ({ ...s, exercises: s.exercises.filter(e => e.id !== id) }));
    setDeleteTarget(null);
  };

  const searchFiltered = state.exercises.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  // phase accent colors matching ExerciseDetailModal
  const phaseAccents = {
    warmup_general: C.blue, warmup_specific: C.olive, compound: C.orange,
    explosive: C.amber, hypertrophy: C.blue, lactic: "#FF6B6B", aerobic: C.olive, cooldown: C.olive
  };

  const ExerciseCard = ({ ex }) => (
    <div key={ex.id} className="relative rounded-xl overflow-hidden cursor-pointer active:opacity-80"
      style={{ background: C.panel, border: `1px solid ${C.border}` }}
      onClick={() => setDetailExercise(ex)}>
      {isCoach && (
        <button onClick={e => { e.stopPropagation(); setDeleteTarget(ex); }}
          className="absolute top-2 right-2 z-10 rounded-full p-1.5" style={{ background: "#000000aa" }}>
          <Trash2 size={13} style={{ color: "#fff" }} />
        </button>
      )}
      <div className="h-24 flex items-center justify-center overflow-hidden" style={{ background: C.border }}>
        {exerciseImage(ex.name)
          ? <img src={exerciseImage(ex.name)} alt={ex.name} className="w-full h-full object-cover" />
          : (
            <div className="w-full h-full flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${phaseAccents[ex.phase] || C.steel}22, ${C.bg})` }}>
              <Dumbbell size={24} style={{ color: phaseAccents[ex.phase] || C.faint }} />
            </div>
          )}
      </div>
      <div className="p-3">
        <div className="text-sm font-medium truncate" style={{ color: C.text }}>{ex.name}</div>
        <div className="text-xs mt-0.5 truncate" style={{ color: C.sub }}>{ex.pattern}</div>
      </div>
    </div>
  );

  return (
    <div className="pb-28">
      <TopBar title="Exercise Library" onLogout={nav.logout}
        right={isCoach && <button onClick={() => setAddOpen(true)}><Plus size={20} style={{ color: C.orange }} /></button>} />
      <div className="px-5 pt-4">
        {/* search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.faint }} />
          <input style={{ ...inputStyle, paddingLeft: 36 }} placeholder="Search exercises..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* phase filter pills */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          <Pill active={phaseFilter === "all"} onClick={() => setPhaseFilter("all")}>
            All ({state.exercises.length})
          </Pill>
          {PHASES.map(p => {
            const count = searchFiltered.filter(e => e.phase === p.key).length;
            return (
              <Pill key={p.key} active={phaseFilter === p.key} onClick={() => setPhaseFilter(p.key)}>
                {p.short} {count > 0 && `(${count})`}
              </Pill>
            );
          })}
        </div>

        {/* content */}
        {phaseFilter === "all" && !search ? (
          // grouped view — section per phase
          <div className="space-y-6">
            {PHASES.map(phase => {
              const exercises = state.exercises.filter(e => e.phase === phase.key);
              if (exercises.length === 0) return null;
              const accent = phaseAccents[phase.key] || C.orange;
              return (
                <div key={phase.key}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-1 h-5 rounded-full shrink-0" style={{ background: accent }} />
                    <span className="font-semibold text-sm" style={{ color: C.text }}>{phase.label}</span>
                    <span className="text-xs font-mono ml-auto shrink-0" style={{ color: C.faint }}>{exercises.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {exercises.map(ex => <ExerciseCard key={ex.id} ex={ex} />)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // flat filtered/searched view
          <div>
            {phaseFilter !== "all" && (
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-5 rounded-full shrink-0" style={{ background: phaseAccents[phaseFilter] || C.orange }} />
                <span className="font-semibold text-sm" style={{ color: C.text }}>
                  {PHASES.find(p => p.key === phaseFilter)?.label}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {searchFiltered
                .filter(e => phaseFilter === "all" || e.phase === phaseFilter)
                .map(ex => <ExerciseCard key={ex.id} ex={ex} />)}
            </div>
            {searchFiltered.filter(e => phaseFilter === "all" || e.phase === phaseFilter).length === 0 && (
              <div className="text-center text-sm py-10" style={{ color: C.faint }}>No exercises match your search.</div>
            )}
          </div>
        )}

        {isCoach && (
          <Btn variant="secondary" className="w-full mt-6" icon={Plus} onClick={() => setAddOpen(true)}>Add Exercise</Btn>
        )}
      </div>

      {isCoach && <AddExerciseModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={addExercise} />}
      <ExerciseDetailModal open={!!detailExercise} onClose={() => setDetailExercise(null)} exercise={detailExercise} />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Exercise">
        <p className="text-sm mb-5" style={{ color: C.text }}>
          Remove <span className="font-semibold">{deleteTarget?.name}</span> from the exercise library? It will also disappear from any program days that currently use it.
        </p>
        <div className="flex gap-2.5">
          <Btn variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Btn>
          <Btn variant="danger" className="flex-1" icon={Trash2} onClick={() => deleteExercise(deleteTarget.id)}>Delete</Btn>
        </div>
      </Modal>
    </div>
  );
}

function CalendarViewPage({ state, nav }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDate, setSelectedDate] = useState(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = todayISO();

  const logsByDate = useMemo(() => {
    const map = {};
    state.workoutLogs.forEach(l => {
      if (!map[l.date]) map[l.date] = [];
      map[l.date].push(l);
    });
    return map;
  }, [state.workoutLogs]);

  const dateStrFor = (day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedLogs = selectedDate ? (logsByDate[selectedDate] || []) : [];

  const blockWeeks = [
    { label: "Week 1-2", focus: "Accumulation" }, { label: "Week 3-4", focus: "Intensification" }, { label: "Week 5-6", focus: "Peak / Taper" }
  ];

  return (
    <div className="pb-28">
      <TopBar title="Calendar" onLogout={nav.logout} />
      <div className="px-5 pt-5">
        <div className="rounded-xl p-4 mb-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() - 1); return d; })}><ChevronLeft size={18} style={{ color: C.sub }} /></button>
            <div className="font-semibold" style={{ fontFamily: "Inter", color: C.text }}>{monthLabel.toUpperCase()}</div>
            <button onClick={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() + 1); return d; })}><ChevronRight size={18} style={{ color: C.sub }} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="text-center text-[10px]" style={{ color: C.faint }}>{d}</div>)}
            {cells.map((d, i) => {
              if (d === null) return <div key={`empty${i}`} />;
              const ds = dateStrFor(d);
              const hasLog = !!logsByDate[ds];
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDate;
              return (
                <button key={ds} onClick={() => setSelectedDate(isSelected ? null : ds)}
                  className="aspect-square rounded-lg flex items-center justify-center text-xs font-mono relative"
                  style={{ background: hasLog ? `${C.orange}22` : C.bg, color: hasLog ? C.orange : C.sub, border: isSelected ? `1px solid ${C.orange}` : isToday ? `1px solid ${C.blue}` : "1px solid transparent" }}>
                  {d}
                  {hasLog && <div className="absolute bottom-1 w-1 h-1 rounded-full" style={{ background: C.orange }} />}
                </button>
              );
            })}
          </div>
        </div>

        {selectedDate && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </div>
            {selectedLogs.length === 0 ? (
              <div className="rounded-lg p-3.5 text-sm" style={{ background: C.panel, border: `1px dashed ${C.border}`, color: C.faint }}>No workout logged this day.</div>
            ) : (
              <div className="space-y-2">
                {selectedLogs.map(l => (
                  <div key={l.id} className="rounded-lg p-3.5 flex items-center gap-3" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div className="rounded-lg p-2 shrink-0" style={{ background: C.border }}><CheckCircle2 size={16} style={{ color: C.olive }} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: C.text }}>{l.programDay}</div>
                      <div className="text-xs" style={{ color: C.sub }}>{l.duration} min{l.mood ? ` · felt ${l.mood}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <ChalkDivider label="Training Block Overview" />
        <div className="space-y-2.5">
          {blockWeeks.map(w => (
            <div key={w.label} className="rounded-lg p-3.5 flex items-center justify-between" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <span className="text-sm font-medium" style={{ color: C.text }}>{w.label}</span>
              <span className="text-xs font-mono shrink-0" style={{ color: C.blue }}>{w.focus}</span>
            </div>
          ))}
        </div>

        <ChalkDivider label="Legend" />
        <div className="flex items-center gap-2 text-xs" style={{ color: C.sub }}>
          <div className="w-3 h-3 rounded shrink-0" style={{ background: `${C.orange}22`, border: `1px solid ${C.orange}` }} /> Workout completed
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function CommunityPage({ state, setState, nav }) {
  const [filter, setFilter] = useState("All");
  const [postText, setPostText] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [expandedPost, setExpandedPost] = useState(null);
  const [posts, setPosts] = useState([]);
  const [myUserId, setMyUserId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const isCoach = !state.me?.sport;
  const myName = isCoach ? (state.coachProfile?.name || "Coach") : (state.me?.name || "You");
  const myAvatar = isCoach ? (state.coachProfile?.avatar || "CO") : (state.me?.avatar || "ME");
  const myPhoto = isCoach ? state.coachProfile?.photoUrl : state.me?.photoUrl;

  const loadPosts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id || null;
    setMyUserId(uid);

    const [{ data: postRows }, { data: replyRows }, { data: likeRows }] = await Promise.all([
      supabase.from("community_posts").select("id, text, created_at, user_id, profiles(name, avatar, photo_url, role, sport)").order("created_at", { ascending: false }),
      supabase.from("community_replies").select("id, post_id, text, created_at, user_id, profiles(name, avatar, photo_url, role)").order("created_at", { ascending: true }),
      supabase.from("community_likes").select("post_id, user_id"),
    ]);

    const likesByPost = {};
    (likeRows || []).forEach(l => { likesByPost[l.post_id] = (likesByPost[l.post_id] || 0) + 1; });
    const likedSet = new Set((likeRows || []).filter(l => l.user_id === uid).map(l => l.post_id));

    const merged = (postRows || []).map(p => ({
      id: p.id, text: p.text, time: timeAgo(p.created_at),
      name: p.profiles?.name || "Someone", avatar: p.profiles?.avatar || "?",
      photoUrl: p.profiles?.photo_url, role: p.profiles?.role, sport: p.profiles?.sport,
      likes: likesByPost[p.id] || 0, liked: likedSet.has(p.id),
      replies: (replyRows || []).filter(r => r.post_id === p.id).map(r => ({
        id: r.id, text: r.text, time: timeAgo(r.created_at),
        name: r.profiles?.name || "Someone", avatar: r.profiles?.avatar || "?",
        photoUrl: r.profiles?.photo_url, role: r.profiles?.role,
      })),
    }));
    setPosts(merged);
    setLoaded(true);
  };

  useEffect(() => {
    loadPosts();
    const channel = supabase
      .channel("community-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, loadPosts)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_replies" }, loadPosts)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_likes" }, loadPosts)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filters = ["All", "MMA", "General Fitness", "Coaches"];
  const filteredPosts = posts.filter(p => {
    if (filter === "All") return true;
    if (filter === "Coaches") return p.role === "coach";
    return p.sport === filter;
  });

  const submitPost = async () => {
    if (!postText.trim() || !myUserId) return;
    const text = postText.trim();
    setPostText("");
    await supabase.from("community_posts").insert({ user_id: myUserId, text });
    loadPosts();
  };

  const toggleLike = async (postId) => {
    if (!myUserId) return;
    const post = posts.find(p => p.id === postId);
    if (post?.liked) await supabase.from("community_likes").delete().eq("post_id", postId).eq("user_id", myUserId);
    else await supabase.from("community_likes").insert({ post_id: postId, user_id: myUserId });
    loadPosts();
  };

  const submitReply = async (postId) => {
    if (!replyText.trim() || !myUserId) return;
    const text = replyText.trim();
    setReplyText(""); setReplyTarget(null);
    await supabase.from("community_replies").insert({ post_id: postId, user_id: myUserId, text });
    loadPosts();
  };

  const PostCard = ({ post, expanded }) => (
    <div className="rounded-2xl overflow-hidden" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <Avatar initials={post.avatar} size={38} photoUrl={post.photoUrl}
            accent={post.role === "coach" ? C.orange : C.blue} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: C.text }}>{post.name}</div>
            <div className="flex items-center gap-1.5">
              {post.role === "coach" && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: `${C.orange}22`, color: C.orange }}>COACH</span>}
              {post.sport && <span className="text-[10px]" style={{ color: C.sub }}>{post.sport}</span>}
              <span className="text-[10px]" style={{ color: C.faint }}>· {post.time}</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <p className="text-sm leading-relaxed mb-3" style={{ color: C.text }}>{post.text}</p>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button onClick={() => toggleLike(post.id)} className="flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: post.liked ? C.orange : C.faint }}>
            <span style={{ fontSize: 16 }}>{post.liked ? "❤️" : "🤍"}</span> {post.likes}
          </button>
          <button onClick={() => { setExpandedPost(expanded ? null : post.id); setReplyTarget(null); }}
            className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.faint }}>
            <MessageSquare size={14} /> {post.replies?.length || 0} {post.replies?.length === 1 ? "reply" : "replies"}
          </button>
          <button onClick={() => { setReplyTarget(replyTarget === post.id ? null : post.id); setExpandedPost(post.id); }}
            className="ml-auto text-xs font-semibold" style={{ color: C.orange }}>
            Reply
          </button>
        </div>
      </div>

      {/* Replies */}
      {expanded && (post.replies || []).length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {post.replies.map(r => (
            <div key={r.id} className="px-4 py-3 flex gap-2.5" style={{ borderBottom: `1px solid ${C.border}88` }}>
              <Avatar initials={r.avatar} size={30} photoUrl={r.photoUrl}
                accent={r.role === "coach" ? C.orange : C.blue} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold" style={{ color: C.text }}>{r.name}</span>
                  {r.role === "coach" && <span className="text-[9px] px-1 py-0.5 rounded font-bold" style={{ background: `${C.orange}22`, color: C.orange }}>COACH</span>}
                  <span className="text-[10px]" style={{ color: C.faint }}>{r.time}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: C.text }}>{r.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      {replyTarget === post.id && (
        <div className="px-4 pb-4 pt-2 flex gap-2.5 items-center" style={{ borderTop: `1px solid ${C.border}` }}>
          <Avatar initials={myAvatar} size={30} photoUrl={myPhoto} />
          <input style={{ ...inputStyle, flex: 1, fontSize: 13, padding: "8px 12px" }}
            placeholder="Write a reply..."
            value={replyText} onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitReply(post.id)} />
          <button onClick={() => submitReply(post.id)} className="rounded-full p-2 shrink-0" style={{ background: C.orange }}>
            <Send size={14} style={{ color: "#fff" }} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-screen pb-16">
      <TopBar title="Community" onLogout={nav.logout} />

      {/* Filter tabs */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        {filters.map(f => <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</Pill>)}
      </div>

      {/* Post composer */}
      <div className="px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="flex gap-2.5 items-start">
          <Avatar initials={myAvatar} size={38} photoUrl={myPhoto} />
          <div className="flex-1 flex gap-2 items-end">
            <textarea
              style={{ ...inputStyle, flex: 1, minHeight: 44, maxHeight: 120, resize: "none", fontSize: 14, padding: "10px 12px", lineHeight: 1.4 }}
              placeholder="Share a win, ask a question, or help someone out..."
              value={postText}
              onChange={e => setPostText(e.target.value)}
              rows={1}
            />
            <button onClick={submitPost} disabled={!postText.trim()} className="rounded-full p-2.5 shrink-0"
              style={{ background: postText.trim() ? C.orange : C.border }}>
              <Send size={16} style={{ color: postText.trim() ? "#fff" : C.faint }} />
            </button>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {!loaded && (
          <div className="text-center py-16"><Loader2 size={24} className="animate-spin mx-auto" style={{ color: C.orange }} /></div>
        )}
        {loaded && filteredPosts.length === 0 && (
          <div className="text-center py-16">
            <div className="text-2xl mb-2">🌍</div>
            <div className="text-sm font-semibold" style={{ color: C.text }}>No posts in this category yet</div>
            <p className="text-xs mt-1" style={{ color: C.sub }}>Be the first to start the conversation.</p>
          </div>
        )}
        {filteredPosts.map(post => (
          <PostCard key={post.id} post={post} expanded={expandedPost === post.id} />
        ))}
      </div>
    </div>
  );
}

function NutritionPage({ state, nav }) {
  const meals = [
    { id: 1, name: "Breakfast", cal: 520, p: 38, c: 52, f: 16 },
    { id: 2, name: "Lunch", cal: 680, p: 45, c: 68, f: 20 },
    { id: 3, name: "Post-Workout Shake", cal: 240, p: 32, c: 18, f: 4 },
  ];
  const totals = meals.reduce((a, m) => ({ cal: a.cal + m.cal, p: a.p + m.p, c: a.c + m.c, f: a.f + m.f }), { cal: 0, p: 0, c: 0, f: 0 });

  return (
    <div className="pb-28">
      <TopBar title="Nutrition" onLogout={nav.logout} right={<button><Plus size={20} style={{ color: C.orange }} /></button>} />
      <div className="px-5 pt-5">
        <div className="grid grid-cols-4 gap-2 mb-6">
          <PlateBadge value={totals.cal} label="Cal" />
          <PlateBadge value={`${totals.p}g`} label="Protein" accent={C.blue} />
          <PlateBadge value={`${totals.c}g`} label="Carbs" accent={C.olive} />
          <PlateBadge value={`${totals.f}g`} label="Fat" accent={C.amber} />
        </div>
        <ChalkDivider label="Today's Meals" />
        <div className="space-y-2.5">
          {meals.map(m => (
            <div key={m.id} className="rounded-xl p-3.5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <div className="flex justify-between items-center gap-2">
                <div className="font-medium text-sm truncate" style={{ color: C.text }}>{m.name}</div>
                <div className="font-mono text-sm shrink-0" style={{ color: C.orange }}>{m.cal} cal</div>
              </div>
              <div className="font-mono text-xs mt-1" style={{ color: C.sub }}>P {m.p}g · C {m.c}g · F {m.f}g</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ROOT APP
// ============================================================

function buildMeFromOnboarding(data) {
  const name = (data.name || "").trim() || "You";
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "ME";
  return {
    id: "a1", name, sex: data.sex === "Female" ? "female" : "male",
    sport: data["🥊 Sport / Focus"] || "General Fitness", streak: 0, avatar: initials, photoUrl: data.photoUrl || null,
    program: "p1", customProgram: null,
    injuries: (data.injuries || []).filter(i => i !== "None currently"),
    goals: data.goals || [], isFighter: !!data.isFighter,
    weightKg: lbToKg(data.weightLb || 175), heightCm: data.heightCm || 178,
  };
}

const initialState = () => ({
  // NOTE: athletes/communityPosts/messages/progress/workoutLogs start EMPTY.
  // This is a live app — a real account should never show fake roster members,
  // fake community posts, fake PRs, or fake training history that hasn't
  // actually happened. Programs/exercises remain as a library coaches can
  // assign from; that's template content, not a claim about real usage.
  athletes: [],
  programs: SEED_PROGRAMS,
  exercises: SEED_EXERCISES,
  messages: {},
  progress: [],
  workoutLogs: [],
  sessionCheckins: {}, // { "YYYY-MM-DD": { confirmed: bool, programDay: string, confirmedAt: string } }
  me: { id: "a1", name: "You", sex: "male", sport: "General Fitness", streak: 0, avatar: "ME", program: null, customProgram: null, injuries: [], goals: [], isFighter: false, weightKg: 79.4, heightCm: 178 },
  coachProfile: { name: "Coach", avatar: "CO", photoUrl: null, accountabilityEnabled: true },
  payments: { rates: [], clientBilling: {}, methods: [] },
  communityPosts: [],
});

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("App crashed:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: 24, fontFamily: "monospace", fontSize: 13, whiteSpace: "pre-wrap", overflowY: "auto" }}>
          <div style={{ color: "#ff6b6b", fontWeight: "bold", fontSize: 16, marginBottom: 12 }}>Something crashed — screenshot this and send it over:</div>
          <div style={{ marginBottom: 12 }}>{String(this.state.error?.message || this.state.error)}</div>
          <div style={{ opacity: 0.6, fontSize: 11 }}>{this.state.error?.stack}</div>
          <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: "10px 16px", background: "#ff6600", color: "#fff", border: "none", borderRadius: 8, fontFamily: "sans-serif", fontWeight: 600 }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}

function AppInner() {
  const [authed, setAuthed] = useState(null);
  const [view, setView] = useState(null);
  const [navParam, setNavParam] = useState(null);
  const [state, setState] = useState(initialState);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authMode, setAuthMode] = useState("onboarding"); // 'onboarding' | 'login'
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = FONT_LINK;
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  // Turn a DB profile row into the local `me` / `coachProfile` shape the rest of the app expects.
  const hydrateFromProfile = async (profile) => {
    if (profile.role === "coach") {
      setState(s => ({ ...s, coachProfile: { ...s.coachProfile, name: profile.name, avatar: profile.avatar, photoUrl: profile.photo_url } }));
    } else {
      setState(s => ({
        ...s,
        me: {
          ...s.me, id: profile.id, name: profile.name, avatar: profile.avatar, photoUrl: profile.photo_url,
          sport: profile.sport, sex: profile.sex, isFighter: profile.is_fighter,
          injuries: profile.injuries || [], goals: profile.goals || [],
          weightKg: profile.weight_kg, heightCm: profile.height_cm, streak: profile.streak || 0,
          selfGuided: profile.role === "athlete", hasCoach: profile.role === "athlete_coached",
          intake: profile.intake || {}, program: null,
        }
      }));

      // Restore this athlete's real program, workout history, and progress from the database.
      const [{ data: programRow }, { data: logRows }, { data: progressRows }] = await Promise.all([
        profile.active_program_id
          ? supabase.from("programs").select("*").eq("id", profile.active_program_id).single()
          : Promise.resolve({ data: null }),
        supabase.from("workout_logs").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }),
        supabase.from("progress_entries").select("*").eq("user_id", profile.id).order("created_at", { ascending: true }),
      ]);

      setState(s => {
        let next = s;
        if (programRow) {
          const { days, newExercises } = buildDaysWithExerciseIds(programRow.days, s);
          const program = { id: programRow.id, name: programRow.name, weeks: programRow.weeks, assignedCount: 1, sport: programRow.sport, days };
          next = { ...next, programs: [...next.programs, program], exercises: [...next.exercises, ...newExercises], me: { ...next.me, program: program.id } };
        }
        if (logRows?.length) {
          next = { ...next, workoutLogs: logRows.map(l => ({ id: l.id, date: l.date, programDay: l.program_day, duration: l.duration, mood: l.mood })) };
        }
        if (progressRows?.length) {
          next = { ...next, progress: progressRows.map(p => ({ date: new Date(p.created_at).toLocaleDateString(), weightKg: p.weight_kg, bodyFat: p.body_fat })) };
        }
        return next;
      });
    }
    setAuthed(profile.role);
    setView(profile.role === "coach" ? "coach-dashboard" : "athlete-dashboard");
  };

  // On load: restore an existing session so refreshing the page doesn't log people out.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { if (active) setSessionLoading(false); return; }
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (active) {
        if (profile) await hydrateFromProfile(profile);
        setSessionLoading(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { setAuthed(null); setView(null); }
    });
    return () => { active = false; listener?.subscription?.unsubscribe(); };
  }, []);

  const [generatingProgram, setGeneratingProgram] = useState(false);

  // Returns an error string on failure, or undefined on success (caller navigates away on success).
  // Extracts a readable message no matter what shape the error comes in —
  // a Supabase error, a network failure, or anything else — so we never show
  // a blank "{}" again.
  const errText = (e) => {
    if (!e) return "Something went wrong. Please try again.";
    if (typeof e === "string") return e;
    if (e.message) return e.message;
    if (e.error_description) return e.error_description;
    try { const s = JSON.stringify(e); return s === "{}" ? "Unknown error — check your connection and try again." : s; }
    catch { return String(e); }
  };

  const handleOnboardComplete = async (role, data) => {
    try {
    const { data: signUpData, error } = await supabase.auth.signUp({ email: data.email, password: data.password });
    if (error) return errText(error);

    // Never persist the raw password (or UI-only noise) anywhere outside Supabase's
    // own hashed auth storage — this is what gets saved as "intake" for later reuse.
    const { password, signupError, showPassword, ...safeIntake } = data;

    const name = (data.name || "").trim() || (role === "coach" ? "Coach" : "You");
    const avatar = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "ME";
    const userId = signUpData.user?.id;

    if (userId) {
      const profileRow = role === "coach"
        ? { id: userId, role, name, avatar, photo_url: data.photoUrl || null }
        : {
            id: userId, role, name, avatar, photo_url: data.photoUrl || null,
            sport: data["🥊 Sport / Focus"] || "General Fitness", sex: data.sex === "Female" ? "female" : "male",
            is_fighter: !!data.isFighter, injuries: (data.injuries || []).filter(i => i !== "None currently"),
            goals: data.goals || [], weight_kg: lbToKg(data.weightLb || 175), height_cm: data.heightCm || 178,
            intake: safeIntake,
          };
      const { error: profileError } = await supabase.from("profiles").insert(profileRow);
      if (profileError) return errText(profileError);
    }

    // Supabase may require email confirmation before a session exists — if so, we can't
    // log them in yet. Show a "check your email" screen instead of the dashboard.
    if (!signUpData.session) {
      setPendingConfirmEmail(data.email);
      return;
    }

    if (role === "athlete" || role === "athlete_coached") {
      const me = { ...buildMeFromOnboarding(data), id: userId, program: null, selfGuided: role === "athlete", hasCoach: role === "athlete_coached", intake: safeIntake };
      setState(s => ({ ...s, me }));
      setAuthed(role);
      setGeneratingProgram(true);
      try {
        const response = await fetch("/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 8192, messages: [{ role: "user", content: buildAIPrompt(data) }] })
        });
        const apiData = await response.json();
        const textBlock = (apiData.content || []).find(b => b.type === "text");
        const parsed = parseAIJson(textBlock?.text);
        const weeks = parsed.weeks || 6;
        const sport = data["🥊 Sport / Focus"] || "General Fitness";
        const dbId = userId ? await createProgramRow(userId, parsed.programName, weeks, sport, parsed.days) : null;
        setState(s => applyGeneratedProgram(parsed, s, data, dbId));
      } catch (err) {
        // generation failed — athlete lands on dashboard without a program, same as before
      }
      setGeneratingProgram(false);
      setView("athlete-dashboard");
    } else {
      setState(s => ({ ...s, coachProfile: { ...s.coachProfile, name, avatar, photoUrl: data.photoUrl || null } }));
      setAuthed(role);
      setView("coach-dashboard");
    }
    } catch (err) {
      setGeneratingProgram(false);
      return errText(err);
    }
  };

  const handleLogin = async (email, password) => {
    try {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return errText(error);
      const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", signInData.user.id).single();
      if (profileError || !profile) return "We couldn't find a profile for this account. Please contact support.";
      await hydrateFromProfile(profile);
    } catch (err) {
      return errText(err);
    }
  };

  const nav = {
    go: (key, param) => { setView(key); setNavParam(param ?? null); },
    logout: () => { supabase.auth.signOut(); setAuthed(null); setView(null); setState(initialState()); },
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <Loader2 size={32} className="animate-spin" style={{ color: C.orange }} />
      </div>
    );
  }

  if (pendingConfirmEmail) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: C.bg }}>
        <Mail size={40} style={{ color: C.orange }} />
        <h2 className="mt-4 text-2xl font-bold" style={{ fontFamily: "Inter", color: C.text }}>Check your email</h2>
        <p className="mt-2 text-sm" style={{ color: C.sub }}>We sent a confirmation link to {pendingConfirmEmail}. Confirm it, then come back and log in.</p>
        <button onClick={() => { setPendingConfirmEmail(null); setAuthMode("login"); }} className="mt-6 text-sm font-semibold" style={{ color: C.orange }}>Back to login</button>
      </div>
    );
  }

  if (!authed || generatingProgram) {
    if (generatingProgram) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: C.bg }}>
          <Loader2 size={40} className="animate-spin mb-6" style={{ color: C.orange }} />
          <h2 className="text-2xl font-bold text-center" style={{ fontFamily: "Inter", color: C.text }}>Building your program</h2>
          <p className="text-sm mt-2 text-center" style={{ color: C.sub }}>AI is creating a personalized plan based on your goals, sport, schedule, and equipment.</p>
        </div>
      );
    }
    if (authMode === "login") {
      return <div style={{ fontFamily: "Inter, sans-serif" }}><LoginScreen onLogin={handleLogin} onSwitchToSignup={() => setAuthMode("onboarding")} /></div>;
    }
    return <div style={{ fontFamily: "Inter, sans-serif" }}><Onboarding onComplete={handleOnboardComplete} onSwitchToLogin={() => setAuthMode("login")} /></div>;
  }

  const coachNavItems = [
    { key: "coach-dashboard", label: "Home", icon: Home },
    { key: "coach-athletes", label: "Athletes", icon: Users },
    { key: "community", label: "Community", icon: MessageSquare },
    { key: "coach-payments", label: "Payments", icon: Award },
    { key: "coach-profile", label: "Profile", icon: User },
  ];
  const athleteNavItems = [
    { key: "athlete-dashboard", label: "Home", icon: LayoutGrid },
    { key: "athlete-program", label: "Program", icon: Dumbbell },
    { key: "athlete-workout", label: "Workout", icon: Flame },
    { key: "community", label: "Community", icon: MessageSquare },
    { key: "athlete-ai", label: "AI Coach", icon: Bot },
    { key: "athlete-profile", label: "Profile", icon: User },
  ];
  const navItems = authed === "coach" ? coachNavItems : athleteNavItems;

  const pages = {
    "coach-dashboard": <CoachDashboard state={state} setState={setState} nav={nav} />,
    "coach-athletes": <CoachAthletes state={state} setState={setState} nav={nav} />,
    "coach-athlete-detail": <CoachAthleteDetail state={state} setState={setState} nav={nav} athleteId={navParam} />,
    "coach-programs": <CoachPrograms state={state} setState={setState} nav={nav} />,
    "coach-messages": <CoachMessages state={state} setState={setState} nav={nav} />,
    "coach-payments": <CoachPayments state={state} setState={setState} nav={nav} />,
    "coach-profile": <CoachProfile state={state} setState={setState} nav={nav} />,
    "athlete-dashboard": <AthleteDashboard state={state} setState={setState} nav={nav} />,
    "athlete-program": <AthleteProgram state={state} setState={setState} nav={nav} />,
    "athlete-workout": <Workout state={state} setState={setState} nav={nav} />,
    "athlete-progress": <AthleteProgress state={state} setState={setState} nav={nav} />,
    "athlete-ai": <AthleteMessages state={state} setState={setState} nav={nav} />,
    "athlete-profile": <AthleteProfile state={state} setState={setState} nav={nav} />,
    "exercise-library": <ExerciseLibraryPage state={state} setState={setState} nav={nav} isCoach={authed === "coach"} />,
    "community": <CommunityPage state={state} setState={setState} nav={nav} />,
    "calendar": <CalendarViewPage state={state} nav={nav} />,
    "nutrition": <NutritionPage state={state} nav={nav} />,
  };

  const activeNavKey = navItems.find(i => i.key === view) ? view : navItems[0].key;

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: C.bg, minHeight: "100vh" }}>
      {pages[view] || pages[authed === "coach" ? "coach-dashboard" : "athlete-dashboard"]}
      <BottomNav items={navItems} active={activeNavKey} onChange={(key) => nav.go(key)} />
    </div>
  );
}

    <div className="mb-4">
      <label className="block text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.sub }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  background: C.bg, border: `1px solid ${C.border}`, color: C.text,
  borderRadius: 8, padding: "10px 12px", width: "100%", fontSize: 14, outline: "none"
};

function UnitToggle({ value, options, onChange }) {
  return (
    <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: `1px solid ${C.border}` }}>
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)} className="px-3 py-1.5 text-xs font-mono font-semibold"
          style={{ background: value === opt ? C.orange : C.panel, color: value === opt ? C.bg : C.sub }}>
          {opt}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// HEIGHT DIAL (scrollable ft/in or cm picker)
// ============================================================
function HeightDial({ unit, valueCm, onChange }) {
  // unit: 'imperial' shows ft/in wheels, 'metric' shows cm wheel
  const ftRange = Array.from({ length: 5 }, (_, i) => i + 3); // 3-7 ft
  const inRange = Array.from({ length: 12 }, (_, i) => i);
  const cmRange = Array.from({ length: 121 }, (_, i) => i + 120); // 120-240cm

  const { ft, inch } = cmToFtIn(valueCm);

  const ItemList = ({ items, selected, onSelect, suffix }) => {
    const ref = useRef(null);
    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const idx = items.indexOf(selected);
      if (idx >= 0) el.scrollTop = idx * 40;
    }, []);
    return (
      <div ref={ref} className="h-40 overflow-y-auto snap-y snap-mandatory rounded-lg" style={{ background: C.bg, border: `1px solid ${C.border}` }}
        onScroll={e => {
          const idx = Math.round(e.target.scrollTop / 40);
          const val = items[Math.max(0, Math.min(items.length - 1, idx))];
          if (val !== undefined && val !== selected) onSelect(val);
        }}>
        <div style={{ height: 60 }} />
        {items.map(v => (
          <div key={v} className="h-10 flex items-center justify-center snap-center font-mono font-bold text-lg"
            style={{ color: v === selected ? C.orange : C.faint }}>
            {v}{suffix}
          </div>
        ))}
        <div style={{ height: 60 }} />
      </div>
    );
  };

  if (unit === "imperial") {
    return (
      <div>
        <div className="flex items-center justify-center gap-4 mb-2 relative">
          <div className="flex-1 relative">
            <ItemList items={ftRange} selected={ft} onSelect={v => onChange(ftInToCm(v, inch))} suffix=" ft" />
          </div>
          <div className="flex-1 relative">
            <ItemList items={inRange} selected={inch} onSelect={v => onChange(ftInToCm(ft, v))} suffix=" in" />
          </div>
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-10 pointer-events-none rounded-lg" style={{ border: `2px solid ${C.orange}66` }} />
        </div>
        <div className="text-center font-mono font-bold text-2xl" style={{ color: C.text }}>{ft} ft {inch} in</div>
      </div>
    );
  }
  return (
    <div>
      <div className="relative">
        <ItemList items={cmRange} selected={valueCm} onSelect={onChange} suffix=" cm" />
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-10 pointer-events-none rounded-lg" style={{ border: `2px solid ${C.orange}66` }} />
      </div>
      <div className="text-center font-mono font-bold text-2xl mt-2" style={{ color: C.text }}>{valueCm} cm</div>
    </div>
  );
}

// ============================================================
// ONBOARDING
// ============================================================

const SPORTS = ["MMA", "General Fitness", "New to training (weightlifting focus)"];
const GOALS = ["Weight Loss", "Build Muscle", "Strength", "Explosive Training", "Conditioning / Endurance", "Flexibility", "Injury Recovery"];
const INJURY_AREAS = ["None currently", "Shoulder", "Knee", "Low back", "Ankle", "Hip", "Elbow / Wrist"];

const DEFAULT_TEST_ATHLETE = {
  sex: "Male",
  "🥊 Sport / Focus": "MMA",
  isFighter: true,
  discipline: "Muay Thai / Wrestling",
  experience: "Intermediate",
  goals: ["Athletic Performance", "Build Muscle"],
  goalNotes: "Test profile — details don't matter",
  timeframe: "Off-season, no fight booked",
  fightDate: null,
  injuries: ["None currently"],
  injuryNotes: "",
  heightCm: 178,
  weightLb: 175,
  weightUnit: "lb",
  heightUnit: "imperial",
  daysPerWeek: 4,
  equipment: ["Full gym access"],
};

// Skip needs a real, unique identity each time — otherwise signUp() fails silently
// (no name/email/password = no real Supabase account = no community access, no login).
function buildSkipTestAthlete() {
  const id = Date.now().toString(36);
  return {
    ...DEFAULT_TEST_ATHLETE,
    name: `Test Athlete ${id.slice(-4)}`,
    email: `test.${id}@trainedbythebest.dev`,
    password: `TestPass${id}!`,
  };
}

function LoginScreen({ onLogin, onSwitchToSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    const err = await onLogin(email, password);
    setLoading(false);
    if (err) setError(err);
  };

  const forgotPassword = async () => {
    if (!/\S+@\S+\.\S+/.test(email)) { setError("Enter your email above first, then tap 'Forgot password?'"); return; }
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) setError(error.message);
    else setResetSent(true);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10" style={{ background: C.bg }}>
      <Dumbbell size={40} style={{ color: C.orange }} />
      <h1 className="mt-4 text-3xl tracking-tight text-center" style={{ fontFamily: "Inter", fontWeight: 800, color: C.text }}>WELCOME BACK</h1>

      <div className="mt-10 w-full max-w-sm">
        <Field label="Email">
          <input type="email" autoFocus placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Password">
          <div className="relative">
            <input type={showPassword ? "text" : "password"} placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, paddingRight: 44 }} onKeyDown={e => e.key === "Enter" && submit()} />
            <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff size={18} style={{ color: C.sub }} /> : <Eye size={18} style={{ color: C.sub }} />}
            </button>
          </div>
        </Field>

        {error && <p className="text-xs mb-3" style={{ color: C.red }}>{error}</p>}
        {resetSent && <p className="text-xs mb-3" style={{ color: C.olive }}>Password reset email sent — check your inbox.</p>}

        <Btn className="w-full mt-2" onClick={submit} disabled={loading || !email || !password}>
          {loading ? "Logging in..." : "Log In"}
        </Btn>

        <button onClick={forgotPassword} className="w-full text-center text-sm mt-4" style={{ color: C.sub }}>
          Forgot password?
        </button>
        <button onClick={onSwitchToSignup} className="w-full text-center text-sm mt-3" style={{ color: C.sub }}>
          New here? <span style={{ color: C.orange, fontWeight: 600 }}>Create an account</span>
        </button>
      </div>
    </div>
  );
}

function Onboarding({ onComplete, onSwitchToLogin }) {
  const [role, setRole] = useState(null);
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    weightUnit: "lb", heightUnit: "imperial", heightCm: 178, weightLb: null,
  });
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const [skipLoading, setSkipLoading] = useState(false);
  const [skipError, setSkipError] = useState(null);

  const coachSteps = ["👤 Your Name", "🏅 Background", "📩 Invite Athletes", "📸 Profile Photo", "🔐 Create Account"];
  const athleteSteps = [
    "👤 Your Name", "💪 Training Experience", "🧬 Sex", "🥊 Sport / Focus", "🥋 Sport Details", "🎯 Goals", "🔍 Goal Depth",
    "🩹 Injuries", "📏 Height", "⚖️ Weight", "📅 Training Schedule", "🏋️ Equipment", "📸 Profile Photo", "🔐 Create Account"
  ];
  const coachedAthleteSteps = ["👤 Your Name", "🔑 Coach Invite Code", ...athleteSteps.slice(1)];
  const steps = role === "coach" ? coachSteps : role === "athlete_coached" ? coachedAthleteSteps : athleteSteps;
  const isLast = step === steps.length - 1;
  const stepName = steps[step];

  // skip "🥋 Sport Details" if not MMA (no fighter-specific follow-up needed)
  const shouldSkip = (name) => {
    if (role !== "athlete" && role !== "athlete_coached") return false;
    if (name === "🥋 Sport Details" && (data["🥊 Sport / Focus"] !== "MMA" || data["🥊 Sport / Focus"] === "New to training (weightlifting focus)")) return true;
    return false;
  };

  const advance = (dir) => {
    let next = step + dir;
    while (next >= 0 && next < steps.length && shouldSkip(steps[next])) next += dir;
    if (next < 0) { setRole(null); setStep(0); return; }
    setStep(Math.max(0, Math.min(steps.length - 1, next)));
  };

  // returns true if the current step has the information it needs to proceed
  const isStepComplete = () => {
    if (role === "coach") {
      switch (stepName) {
        case "👤 Your Name": return !!(data.name || "").trim();
        case "🏅 Background": return !!data["🏅 Background"];
        case "⚡ Specialties": return true;
        case "🎯 Coaching Style": return true;
        case "📩 Invite Athletes": return true; // optional by design
        case "📸 Profile Photo": return true; // optional by design
        case "🔐 Create Account": return /\S+@\S+\.\S+/.test(data.email || "") && (data.password || "").length >= 6;
        default: return true;
      }
    }
    switch (stepName) {
      case "👤 Your Name": return !!(data.name || "").trim();
      case "💪 Training Experience": return !!data.experience;
      case "🔑 Coach Invite Code": return (data.inviteCode || "").length === 6;
      case "🧬 Sex": return !!data.sex;
      case "🥊 Sport / Focus": return !!data["🥊 Sport / Focus"];
      case "🥋 Sport Details": return data.isFighter !== undefined && data.isFighter !== null;
      case "🎯 Goals": return (data.goals || []).length > 0;
      case "🔍 Goal Depth": return !!data.timeframe && (data.timeframe !== "Competition date" || !!data.fightDate);
      case "🩹 Injuries": return (data.injuries || []).length > 0;
      case "📏 Height": return !!data.heightCm;
      case "⚖️ Weight": return !!data.weightLb && data.weightLb > 0;
      case "📅 Training Schedule": return !!data.daysPerWeek;
      case "🏋️ Equipment": return (data.equipment || []).length > 0;
      case "📸 Profile Photo": return true; // optional by design
      case "🔐 Create Account": return /\S+@\S+\.\S+/.test(data.email || "") && (data.password || "").length >= 6;
      default: return true;
    }
  };
  const canProceed = isStepComplete();

  const handleNext = () => {
    if (!canProceed) return;
    if (isLast) {
      onComplete(role, data).then(err => { if (err) setData(d => ({ ...d, signupError: err })); });
    } else {
      advance(1);
    }
  };

  // Window-level listener (not just onKeyDown on the container) so Enter works
  // even on steps built from tap-to-select buttons, where nothing has real
  // keyboard focus — especially on mobile browsers. These hooks must run on
  // EVERY render (before any early return) or React throws error #310.
  const handleNextRef = useRef(handleNext);
  useEffect(() => { handleNextRef.current = handleNext; });
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        handleNextRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!role) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10" style={{ background: C.bg }}>
        <Dumbbell size={40} style={{ color: C.orange }} />
        <h1 className="mt-4 text-4xl tracking-tight text-center" style={{ fontFamily: "Inter", fontWeight: 800, color: C.text }}>TRAINEDBEST</h1>
        <p className="mt-2 text-sm" style={{ color: C.sub }}>Beyourownhero</p>

        <div className="mt-12 w-full max-w-sm space-y-3">
          <button onClick={() => setRole("coach")}
            className="w-full text-left rounded-xl p-5 transition-transform active:scale-[0.98]"
            style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2.5 shrink-0" style={{ background: `${C.orange}22` }}><Shield size={22} style={{ color: C.orange }} /></div>
              <div className="min-w-0">
                <div className="font-semibold" style={{ color: C.text, fontFamily: "Inter" }}>I'M A COACH</div>
                <div className="text-xs mt-0.5" style={{ color: C.sub }}>Build programs, track athletes, message your roster</div>
              </div>
            </div>
          </button>
          <button onClick={() => setRole("athlete_coached")}
            className="w-full text-left rounded-xl p-5 transition-transform active:scale-[0.98]"
            style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2.5 shrink-0" style={{ background: `${C.steel}55` }}><Users size={22} style={{ color: C.blue }} /></div>
              <div className="min-w-0">
                <div className="font-semibold" style={{ color: C.text, fontFamily: "Inter" }}>I HAVE A COACH</div>
                <div className="text-xs mt-0.5" style={{ color: C.sub }}>Join your coach's roster with an invite code</div>
              </div>
            </div>
          </button>
          <button onClick={() => setRole("athlete")}
            className="w-full text-left rounded-xl p-5 transition-transform active:scale-[0.98]"
            style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2.5 shrink-0" style={{ background: `${C.olive}22` }}><Zap size={22} style={{ color: C.olive }} /></div>
              <div className="min-w-0">
                <div className="font-semibold" style={{ color: C.text, fontFamily: "Inter" }}>SELF-GUIDED ATHLETE</div>
                <div className="text-xs mt-0.5" style={{ color: C.sub }}>Get an AI-generated program instantly, train on your own</div>
              </div>
            </div>
          </button>
        </div>

        <button onClick={async () => {
          setSkipLoading(true); setSkipError(null);
          const err = await onComplete("athlete", buildSkipTestAthlete());
          setSkipLoading(false);
          if (err) setSkipError(err);
        }}
          disabled={skipLoading}
          className="mt-8 text-xs font-semibold px-4 py-2 rounded-full"
          style={{ color: C.faint, border: `1px dashed ${C.border}` }}>
          {skipLoading ? "Setting up..." : "⚡ Skip (dev/test — generated profile)"}
        </button>
        {skipError && <p className="text-xs mt-2 text-center" style={{ color: C.red }}>{skipError}</p>}

        <button onClick={onSwitchToLogin} className="mt-4 text-sm" style={{ color: C.sub }}>
          Already have an account? <span style={{ color: C.orange, fontWeight: 600 }}>Log in</span>
        </button>

        <div className="mt-8 text-[10px]" style={{ color: C.faint }}>build {BUILD_TAG}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bg }}>
      <div className="px-6 pt-8 pb-4 shrink-0">
        <div className="flex items-center gap-1.5 mb-1">
          {steps.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? C.orange : C.border }} />
          ))}
        </div>
        <div className="text-xs uppercase tracking-wider mt-2" style={{ color: C.sub }}>Step {step + 1} of {steps.length}</div>
      </div>

      <div className="flex-1 px-6 overflow-y-auto pb-4">
        <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: "Inter", color: C.text }}>{stepName}</h2>
        <OnboardingStepBody role={role} stepName={stepName} data={data} setData={setData} />
      </div>

      <div className="px-6 pb-8 pt-4 flex gap-3 shrink-0" style={{ borderTop: `1px solid ${C.border}` }}>
        <Btn variant="secondary" onClick={() => advance(-1)} icon={ChevronLeft}>Back</Btn>
        <Btn className="flex-1" disabled={!canProceed} onClick={handleNext}>
          {isLast ? "Finish Setup" : "Continue"}
        </Btn>
      </div>
    </div>
  );
}

function OnboardingStepBody({ role, stepName, data, setData }) {
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  // Invite code step — only appears for athlete_coached role
  if (stepName === "🔑 Coach Invite Code") {
    const code = data.inviteCode || "";
    return (
      <div>
        <p className="text-sm mb-6" style={{ color: C.sub }}>Your coach will share a 6-digit invite code with you. Enter it below to link your account to their roster.</p>
        <div className="relative mb-3">
          <input
            type="text"
            maxLength={6}
            autoFocus
            placeholder="ENTER CODE"
            value={code}
            onChange={e => set("inviteCode", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            style={{
              background: C.panel,
              border: `2px solid ${code.length === 6 ? C.olive : C.orange}`,
              color: C.text,
              borderRadius: 16,
              padding: "20px 24px",
              width: "100%",
              fontSize: 32,
              fontFamily: "JetBrains Mono",
              fontWeight: 700,
              textAlign: "center",
              letterSpacing: "0.35em",
              outline: "none",
              caretColor: C.orange,
            }}
          />
          {code.length === 6 && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <CheckCircle2 size={22} style={{ color: C.olive }} />
            </div>
          )}
        </div>
        <div className="flex justify-center gap-2 mb-6">
          {Array.from({length: 6}).map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full transition-all"
              style={{ background: i < code.length ? C.orange : C.border, transform: i < code.length ? "scale(1.3)" : "scale(1)" }} />
          ))}
        </div>
        <p className="text-xs text-center" style={{ color: C.faint }}>Don't have a code? Ask your coach to send one from their dashboard.</p>
      </div>
    );
  }

  // Name step — shared across all roles, asked early for personalization
  if (stepName === "👤 Your Name") {
    return (
      <div>
        <p className="text-sm mb-6" style={{ color: C.sub }}>What should we call you? This is how you'll appear to {role === "coach" ? "your athletes" : "your coach and the community"}.</p>
        <input
          type="text"
          autoFocus
          placeholder="Your name"
          value={data.name || ""}
          onChange={e => set("name", e.target.value)}
          style={{ ...inputStyle, fontSize: 20, padding: "16px" }}
        />
      </div>
    );
  }

  // Photo step — shared across all roles, optional, placed at the end after investment is built
  if (stepName === "📸 Profile Photo") {
    return (
      <div className="flex flex-col items-center pt-4">
        <p className="text-sm mb-6 text-center" style={{ color: C.sub }}>Add a profile photo so people recognize you. You can always add or change this later — totally optional.</p>
        <EditableAvatar
          initials={(data.name || "?").trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?"}
          size={120}
          photoUrl={data.photoUrl}
          onChange={url => set("photoUrl", url)}
        />
        {data.photoUrl && (
          <button onClick={() => set("photoUrl", null)} className="mt-4 text-xs font-semibold" style={{ color: C.sub }}>Remove photo</button>
        )}
      </div>
    );
  }

  // Account step — shared, last step, creates the real login credentials
  if (stepName === "🔐 Create Account") {
    return (
      <div>
        <p className="text-sm mb-6" style={{ color: C.sub }}>Create your login so you can come back anytime — this is also how you'll reset your password if you forget it.</p>
        <Field label="Email">
          <input type="email" autoFocus placeholder="you@example.com" value={data.email || ""} onChange={e => set("email", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Password">
          <div className="relative">
            <input type={data.showPassword ? "text" : "password"} placeholder="At least 6 characters" value={data.password || ""} onChange={e => set("password", e.target.value)} style={{ ...inputStyle, paddingRight: 44 }} />
            <button type="button" onClick={() => set("showPassword", !data.showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label={data.showPassword ? "Hide password" : "Show password"}>
              {data.showPassword ? <EyeOff size={18} style={{ color: C.sub }} /> : <Eye size={18} style={{ color: C.sub }} />}
            </button>
          </div>
        </Field>
        {data.signupError && (
          <p className="text-xs mt-2" style={{ color: C.red }}>{data.signupError}</p>
        )}
      </div>
    );
  }

  if (role === "coach") {
    const opts = {
      "🏅 Background": ["0-2 years coaching", "3-5 years coaching", "6-10 years coaching", "10+ years coaching"],
      "⚡ Specialties": ["Strength & Power", "MMA / Combat Performance", "Olympic Lifting", "Return-to-Play", "Conditioning", "General Fitness Coaching"],
      "🎯 Coaching Style": ["High intensity / direct", "Technical / cue-heavy", "Collaborative / athlete-led", "Data-driven"],
    };
    if (stepName === "📩 Invite Athletes") {
      return (
        <div>
          <p className="text-sm mb-4" style={{ color: C.sub }}>Add athlete emails now, or skip and invite later from your dashboard.</p>
          <Field label="Athlete email"><input style={inputStyle} placeholder="athlete@email.com" /></Field>
          <Btn variant="secondary" icon={Plus}>Add another</Btn>
        </div>
      );
    }
    const isMulti = stepName === "⚡ Specialties";
    const list = opts[stepName] || [];
    const current = data[stepName] || (isMulti ? [] : null);
    return (
      <div className="grid grid-cols-1 gap-2.5">
        {list.map(opt => {
          const isActive = isMulti ? current.includes(opt) : current === opt;
          return (
            <button key={opt} onClick={() => isMulti ? set(stepName, current.includes(opt) ? current.filter(x => x !== opt) : [...current, opt]) : set(stepName, opt)}
              className="text-left rounded-lg px-4 py-3.5 flex items-center justify-between transition-colors"
              style={{ background: isActive ? `${C.orange}18` : C.panel, border: `1px solid ${isActive ? C.orange : C.border}` }}>
              <span style={{ color: isActive ? C.orange : C.text, fontWeight: isActive ? 600 : 400 }}>{opt}</span>
              {isActive && <Check size={16} style={{ color: C.orange }} />}
            </button>
          );
        })}
      </div>
    );
  }

  // ATHLETE STEPS
  switch (stepName) {
    case "💪 Training Experience": {
      const list = ["New to training", "Beginner (under 1 year)", "Intermediate (1-3 years)", "Advanced (3+ years)"];
      return (
        <div className="grid grid-cols-1 gap-2.5">
          {list.map(opt => (
            <button key={opt} onClick={() => set("experience", opt)} className="text-left rounded-lg px-4 py-3.5 flex items-center justify-between"
              style={{ background: data.experience === opt ? `${C.orange}18` : C.panel, border: `1px solid ${data.experience === opt ? C.orange : C.border}` }}>
              <span style={{ color: data.experience === opt ? C.orange : C.text, fontWeight: data.experience === opt ? 600 : 400 }}>{opt}</span>
              {data.experience === opt && <Check size={16} style={{ color: C.orange }} />}
            </button>
          ))}
        </div>
      );
    }
    case "🧬 Sex": {
      return (
        <div className="grid grid-cols-2 gap-3">
          {["Male", "Female"].map(opt => (
            <button key={opt} onClick={() => set("sex", opt)} className="rounded-xl p-5 text-center"
              style={{ background: data.sex === opt ? `${C.orange}18` : C.panel, border: `1px solid ${data.sex === opt ? C.orange : C.border}` }}>
              <span className="font-semibold" style={{ color: data.sex === opt ? C.orange : C.text, fontFamily: "Inter" }}>{opt.toUpperCase()}</span>
            </button>
          ))}
        </div>
      );
    }
    case "🥊 Sport / Focus": {
      return (
        <div className="grid grid-cols-1 gap-2.5">
          {SPORTS.map(opt => (
            <button key={opt} onClick={() => set("🥊 Sport / Focus", opt)} className="text-left rounded-lg px-4 py-3.5 flex items-center justify-between"
              style={{ background: data["🥊 Sport / Focus"] === opt ? `${C.orange}18` : C.panel, border: `1px solid ${data["🥊 Sport / Focus"] === opt ? C.orange : C.border}` }}>
              <span style={{ color: data["🥊 Sport / Focus"] === opt ? C.orange : C.text, fontWeight: data["🥊 Sport / Focus"] === opt ? 600 : 400 }}>{opt}</span>
              {data["🥊 Sport / Focus"] === opt && <Check size={16} style={{ color: C.orange }} />}
            </button>
          ))}
        </div>
      );
    }
    case "🥋 Sport Details": {
      return (
        <div>
          <Field label="Are you a fighter (competing) or training for fitness/skill?">
            <div className="grid grid-cols-2 gap-3">
              {["Competing fighter", "Training only"].map(opt => (
                <button key={opt} onClick={() => set("isFighter", opt === "Competing fighter")}
                  className="rounded-lg p-3.5 text-center text-sm font-medium"
                  style={{ background: data.isFighter === (opt === "Competing fighter") ? `${C.orange}18` : C.panel, border: `1px solid ${data.isFighter === (opt === "Competing fighter") ? C.orange : C.border}`, color: data.isFighter === (opt === "Competing fighter") ? C.orange : C.text }}>
                  {opt}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Discipline (optional)">
            <input style={inputStyle} placeholder="e.g. Muay Thai, BJJ, MMA, Boxing" value={data.discipline || ""} onChange={e => set("discipline", e.target.value)} />
          </Field>
        </div>
      );
    }
    case "🎯 Goals": {
      const current = data.goals || [];
      return (
        <div>
          <p className="text-xs mb-3" style={{ color: C.sub }}>Select all that apply. Multiple goals will combine into a condensed training approach.</p>
          <div className="grid grid-cols-1 gap-2.5">
            {GOALS.map(opt => {
              const isActive = current.includes(opt);
              return (
                <button key={opt} onClick={() => set("goals", isActive ? current.filter(x => x !== opt) : [...current, opt])}
                  className="text-left rounded-lg px-4 py-3.5 flex items-center justify-between"
                  style={{ background: isActive ? `${C.orange}18` : C.panel, border: `1px solid ${isActive ? C.orange : C.border}` }}>
                  <span style={{ color: isActive ? C.orange : C.text, fontWeight: isActive ? 600 : 400 }}>{opt}</span>
                  {isActive && <Check size={16} style={{ color: C.orange }} />}
                </button>
              );
            })}
          </div>
          {current.length > 1 && (
            <div className="mt-3 rounded-lg p-3 flex items-start gap-2" style={{ background: `${C.blue}18`, border: `1px solid ${C.blue}55` }}>
              <Sparkles size={15} style={{ color: C.blue }} className="mt-0.5 shrink-0" />
              <span className="text-xs" style={{ color: C.blue }}>Condensed model: we'll blend {current.join(" + ")} into one program instead of separate plans.</span>
            </div>
          )}
        </div>
      );
    }
    case "🔍 Goal Depth": {
      const weeksOut = data.fightDate ? Math.max(1, Math.round((new Date(data.fightDate) - new Date()) / (1000 * 60 * 60 * 24 * 7))) : null;
      return (
        <div>
          <Field label="What's holding you back right now?">
            <p className="text-xs mb-2.5" style={{ color: C.sub }}>Select all that apply.</p>
            <div className="grid grid-cols-1 gap-2">
              {["Lack of structured program", "Lack of support / accountability", "Injuries or physical limitations", "Lack of information / knowledge", "Time constraints", "Plateaued on current routine", "Recovery / fatigue issues", "Nutrition gaps", "Mental blocks / motivation"].map(opt => {
                const isActive = (data.barriers || []).includes(opt);
                return (
                  <button key={opt} onClick={() => set("barriers", isActive ? (data.barriers || []).filter(x => x !== opt) : [...(data.barriers || []), opt])}
                    className="text-left rounded-lg px-3.5 py-3 flex items-center justify-between"
                    style={{ background: isActive ? `${C.orange}18` : C.panel, border: `1px solid ${isActive ? C.orange : C.border}` }}>
                    <span className="text-sm" style={{ color: isActive ? C.orange : C.text, fontWeight: isActive ? 600 : 400 }}>{opt}</span>
                    {isActive && <Check size={15} style={{ color: C.orange }} />}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Target timeframe">
            <div className="grid grid-cols-2 gap-2.5">
              {["N/A — no event", "4-6 weeks", "8-12 weeks", "Competition date"].map(opt => (
                <button key={opt} onClick={() => { set("timeframe", opt); if (opt !== "Competition date") set("fightDate", null); }}
                  className="rounded-lg p-3 text-center text-sm"
                  style={{ background: data.timeframe === opt ? `${C.orange}18` : C.panel, border: `1px solid ${data.timeframe === opt ? C.orange : C.border}`, color: data.timeframe === opt ? C.orange : C.text }}>
                  {opt}
                </button>
              ))}
            </div>
          </Field>
          {data.timeframe === "Competition date" && (
            <Field label="Pick your competition date">
              <input type="date" style={{ ...inputStyle, colorScheme: "dark" }} min={new Date().toISOString().slice(0, 10)}
                value={data.fightDate || ""} onChange={e => set("fightDate", e.target.value)} />
              {weeksOut !== null && weeksOut > 0 && (
                <div className="mt-3 rounded-lg p-3.5 flex items-start gap-2.5" style={{ background: `${C.orange}18`, border: `1px solid ${C.orange}55` }}>
                  <Target size={15} style={{ color: C.orange }} className="mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold" style={{ color: C.orange }}>{weeksOut} weeks out</div>
                    <div className="text-xs mt-0.5" style={{ color: C.text }}>
                      {weeksOut >= 12 ? "Full periodized camp — enough time for accumulation, intensification and peak phases." :
                        weeksOut >= 8 ? "Standard 8-week camp — we'll compress into intensification and a short peak." :
                        weeksOut >= 6 ? "Short camp — direct prep focus, minimal volume, max specificity." :
                        "Very short turnaround — we'll keep it sharp and specific, no new stimuli."}
                    </div>
                  </div>
                </div>
              )}
            </Field>
          )}
        </div>
      );
    }
    case "🩹 Injuries": {
      const current = data.injuries || [];
      return (
        <div>
          <p className="text-xs mb-3" style={{ color: C.sub }}>We'll prime and work around these in every session.</p>
          <div className="grid grid-cols-1 gap-2.5">
            {INJURY_AREAS.map(opt => {
              const isActive = current.includes(opt);
              return (
                <button key={opt} onClick={() => {
                  if (opt === "None currently") { set("injuries", ["None currently"]); return; }
                  const without = current.filter(x => x !== "None currently");
                  set("injuries", isActive ? without.filter(x => x !== opt) : [...without, opt]);
                }} className="text-left rounded-lg px-4 py-3.5 flex items-center justify-between"
                  style={{ background: isActive ? `${C.orange}18` : C.panel, border: `1px solid ${isActive ? C.orange : C.border}` }}>
                  <span style={{ color: isActive ? C.orange : C.text, fontWeight: isActive ? 600 : 400 }}>{opt}</span>
                  {isActive && <Check size={16} style={{ color: C.orange }} />}
                </button>
              );
            })}
          </div>
          {current.some(i => i !== "None currently") && (
            <Field label="Anything else we should know?">
              <textarea style={{ ...inputStyle, minHeight: 60, marginTop: 10 }} placeholder="Details on the injury, limitations, cleared by a doctor, etc."
                value={data.injuryNotes || ""} onChange={e => set("injuryNotes", e.target.value)} />
            </Field>
          )}
        </div>
      );
    }
    case "📏 Height": {
      return (
        <div>
          <div className="flex justify-end mb-4"><UnitToggle value={data.heightUnit} options={["imperial", "metric"]} onChange={v => set("heightUnit", v)} /></div>
          <HeightDial unit={data.heightUnit} valueCm={data.heightCm} onChange={v => set("heightCm", v)} />
        </div>
      );
    }
    case "⚖️ Weight": {
      const lb = data.weightUnit === "lb" ? data.weightLb : kgToLb(data.weightLb);
      const sliderLb = Math.min(300, Math.max(100, data.weightLb || 175));
      const pct = ((sliderLb - 100) / (300 - 100)) * 100;
      return (
        <div>
          <style>{`
            .weight-slider {
              -webkit-appearance: none; appearance: none;
              width: 100%; height: 10px; border-radius: 999px; outline: none;
              background: linear-gradient(to right, ${C.orange} 0%, ${C.orange} ${pct}%, ${C.border} ${pct}%, ${C.border} 100%);
            }
            .weight-slider::-webkit-slider-thumb {
              -webkit-appearance: none; appearance: none;
              width: 34px; height: 34px; border-radius: 50%;
              background: ${C.orange}; border: 4px solid #fff;
              box-shadow: 0 2px 10px rgba(0,0,0,0.35); cursor: pointer;
            }
            .weight-slider::-moz-range-thumb {
              width: 34px; height: 34px; border-radius: 50%;
              background: ${C.orange}; border: 4px solid #fff;
              box-shadow: 0 2px 10px rgba(0,0,0,0.35); cursor: pointer;
            }
            .weight-slider::-moz-range-track { height: 10px; border-radius: 999px; background: ${C.border}; }
          `}</style>

          <div className="flex justify-end mb-4"><UnitToggle value={data.weightUnit} options={["lb", "kg"]} onChange={v => set("weightUnit", v)} /></div>

          <div className="text-center mb-6">
            <div style={{ fontSize: 44, fontFamily: "JetBrains Mono", fontWeight: 800, color: C.text }}>
              {data.weightLb ? (data.weightUnit === "lb" ? Math.round(data.weightLb) : Math.round(lbToKg(data.weightLb))) : "—"}
            </div>
            <div className="text-sm mt-1" style={{ color: C.sub }}>{data.weightUnit === "lb" ? "pounds" : "kilograms"}</div>
          </div>

          <div className="px-2 py-4 rounded-2xl" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <input
              type="range" min={100} max={300} step={1}
              value={sliderLb}
              onChange={e => set("weightLb", Number(e.target.value))}
              className="weight-slider"
            />
            <div className="flex justify-between text-[10px] mt-2 px-0.5" style={{ color: C.faint }}>
              <span>100 lb</span>
              <span>150</span>
              <span>200</span>
              <span>250</span>
              <span>300+ lb</span>
            </div>
          </div>

          {(data.weightLb || 0) >= 300 && (
            <p className="text-center text-xs mt-3" style={{ color: C.sub }}>At the top of the slider — tap below to type an exact number if you're over 300 lb.</p>
          )}

          <div className="text-center mt-4">
            <input type="number" style={{ ...inputStyle, textAlign: "center", fontSize: 16, padding: "10px", maxWidth: 160, margin: "0 auto" }}
              placeholder="Type exact number"
              value={data.weightLb ? (data.weightUnit === "lb" ? data.weightLb : lbToKg(data.weightLb)) : ""}
              onChange={e => {
                const v = parseFloat(e.target.value) || 0;
                set("weightLb", data.weightUnit === "lb" ? v : kgToLb(v));
              }} />
          </div>
        </div>
      );
    }
    case "📅 Training Schedule": {
      const days = [2, 3, 4, 5, 6, 7];
      const exp = data.experience || "Beginner";
      return (
        <div>
          <p className="text-xs mb-3" style={{ color: C.sub }}>How many days per week can you realistically train?</p>
          <div className="grid grid-cols-3 gap-2.5">
            {days.map(d => (
              <button key={d} onClick={() => set("daysPerWeek", d)} className="rounded-lg p-3.5 text-center"
                style={{ background: data.daysPerWeek === d ? `${C.orange}18` : C.panel, border: `1px solid ${data.daysPerWeek === d ? C.orange : C.border}` }}>
                <div className="font-mono font-bold text-xl" style={{ color: data.daysPerWeek === d ? C.orange : C.text }}>{d}</div>
                <div className="text-[10px]" style={{ color: C.sub }}>days/wk</div>
              </button>
            ))}
          </div>

        </div>
      );
    }
    case "🏋️ Equipment": {
      const list = [
        "Full gym access", "MMA gym (bags, mats, etc.)", "Barbell + rack", "Dumbbells",
        "Kettlebells", "Resistance bands", "Pull-up bar", "Med ball", "Sled / prowler",
        "Cardio equipment (bike, rower, etc.)", "Bodyweight only"
      ];
      const current = data.equipment || [];
      return (
        <div>
          <p className="text-xs mb-3" style={{ color: C.sub }}>Select everything you have access to — your program will only use what you've checked.</p>
          <div className="grid grid-cols-1 gap-2.5">
            {list.map(opt => {
              const isActive = current.includes(opt);
              return (
                <button key={opt} onClick={() => set("equipment", isActive ? current.filter(x => x !== opt) : [...current, opt])}
                  className="text-left rounded-lg px-4 py-3.5 flex items-center justify-between"
                  style={{ background: isActive ? `${C.orange}18` : C.panel, border: `1px solid ${isActive ? C.orange : C.border}` }}>
                  <span style={{ color: isActive ? C.orange : C.text, fontWeight: isActive ? 600 : 400 }}>{opt}</span>
                  {isActive && <Check size={16} style={{ color: C.orange }} />}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    default: return null;
  }
}

// ============================================================
// SHARED CHROME
// ============================================================

function TopBar({ title, onLogout, right }) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-5 py-4" style={{ background: `${C.bg}ee`, backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.border}` }}>
      <h1 className="text-xl font-bold tracking-tight truncate" style={{ fontFamily: "Inter", color: C.text }}>{title}</h1>
      <div className="flex items-center gap-3 shrink-0">
        {right}
        {onLogout && <button onClick={onLogout} style={{ color: C.sub }}><LogOut size={18} /></button>}
      </div>
    </div>
  );
}

function BottomNav({ items, active, onChange }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 flex justify-around items-center py-2 px-1.5" style={{ background: `${C.bg}f5`, backdropFilter: "blur(10px)", borderTop: `1px solid ${C.border}` }}>
      {items.map(it => {
        const isActive = active === it.key;
        return (
          <button key={it.key} onClick={() => onChange(it.key)} className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-2xl min-w-0 transition-colors"
            style={{ background: isActive ? `${C.orange}26` : "transparent" }}>
            <it.icon size={19} style={{ color: isActive ? C.orange : "#6B7078" }} />
            <span className="text-[9px] font-medium truncate" style={{ color: isActive ? C.orange : "#6B7078" }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// EXERCISE SWAP MODAL — pattern-matched, full pick list
// ============================================================
function ExerciseSwapModal({ open, onClose, currentExercise, exercises, onSwap, reasonPreset }) {
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState(reasonPreset || "");
  if (!currentExercise) return null;
  const ex = exercises.find(e => e.id === currentExercise.exerciseId);
  const pattern = ex?.pattern;
  const candidates = exercisesByPattern(pattern, ex?.id).filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
  const phaseLabel = PHASES.find(p => p.key === ex?.phase)?.label;

  return (
    <Modal open={open} onClose={onClose} title="Swap Exercise" wide>
      <div className="mb-4 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <div className="text-xs" style={{ color: C.sub }}>Swapping</div>
        <div className="font-semibold" style={{ color: C.text }}>{ex?.name}</div>
        <div className="text-xs mt-1" style={{ color: C.orange }}>{phaseLabel} · {pattern} pattern</div>
      </div>
      <Field label="Reason (optional)">
        <div className="flex flex-wrap gap-2">
          {["Injury / pain", "Equipment unavailable", "Prefer alternative"].map(r => (
            <Pill key={r} active={reason === r} onClick={() => setReason(r)}>{r}</Pill>
          ))}
        </div>
      </Field>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.faint }} />
        <input style={{ ...inputStyle, paddingLeft: 36 }} placeholder={`Search ${pattern} exercises...`} value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <p className="text-xs mb-2.5" style={{ color: C.sub }}>Showing exercises with the same movement pattern ({pattern}) so the stimulus stays consistent.</p>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {candidates.length === 0 && <div className="text-sm text-center py-6" style={{ color: C.faint }}>No other {pattern} exercises match your search.</div>}
        {candidates.map(c => (
          <button key={c.id} onClick={() => { onSwap(c, reason); onClose(); }}
            className="w-full text-left rounded-lg p-3 flex items-center gap-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
            <div className="rounded-md w-9 h-9 flex items-center justify-center shrink-0 overflow-hidden" style={{ background: C.border }}>
              {exerciseImage(c.name) ? <img src={exerciseImage(c.name)} alt={c.name} className="w-full h-full object-cover" /> : <Dumbbell size={15} style={{ color: C.faint }} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: C.text }}>{c.name}</div>
              <div className="text-xs" style={{ color: C.sub }}>{c.pattern}</div>
            </div>
            {c.hasMedia && <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${C.olive}22`, color: C.olive }}>Media</span>}
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ============================================================
// AI PROGRAM GENERATOR — calls Claude API
// ============================================================
function buildAIPrompt(intake) {
  return `You are an elite strength & conditioning coach. Generate a training program based on this athlete intake. Respond ONLY with valid JSON, no markdown fences, no preamble.

Athlete intake:
- Sex: ${intake.sex || "unspecified"}
- Sport/focus: ${intake["🥊 Sport / Focus"] || "General Fitness"}
- Fighter status: ${intake.isFighter ? "Competing fighter" : "Training only"}
- Discipline: ${intake.discipline || "n/a"}
- Training experience: ${intake.experience || "Beginner"}
- Goals: ${(intake.goals || []).join(", ") || "General fitness"}
- Goal notes: ${intake.goalNotes || "n/a"}
- Timeframe: ${intake.timeframe || "n/a"}${intake.fightDate ? ` (competition date: ${intake.fightDate}, ${Math.max(1, Math.round((new Date(intake.fightDate) - new Date()) / (1000*60*60*24*7)))} weeks out)` : ""}
- Injuries: ${(intake.injuries || []).join(", ") || "None"}
- Injury notes: ${intake.injuryNotes || "n/a"}
- Height: ${intake.heightCm}cm
- Weight: ${intake.weightLb}lb
- Days per week: ${intake.daysPerWeek || 4}
- Equipment: ${(intake.equipment || []).join(", ") || "Full gym access"}

Rules:
- Exercise order within EVERY training day must follow this exact phase sequence (skip phases that don't apply to that day): dynamic warmup, 1-2 primer exercises (movement prep, and injury-specific prehab if injuries are listed), plyometrics/med ball throws, strength work — main compound movements then accessories, cardio (short conditioning pieces like assault bike repeats, sled work, etc.), static stretching and cooldown.
- If a day includes longer aerobic conditioning work (steady-state or extended intervals), give that aerobic work its own dedicated day rather than combining it with a strength session, since it takes significant time on its own.
- Short, low-time-cost conditioning pieces (e.g. short-burst assault bike repeats for explosive-repeat capacity) belong in the cardio slot before stretching/cooldown, not on a separate day.
- If the athlete has injuries, include specific priming/prehab work for that area in the primer exercises and avoid contraindicated movements.
- If sport is MMA, include striking/conditioning elements (bag work, battle ropes) and explosive/rotational power work in the plyometrics/cardio slots.
- Match days per week to the requested schedule.
- Use real exercise names (e.g. "Trap Bar Deadlift", "Med Ball Rotational Slam", "Landmine Press", "Battle Rope Wave Intervals").

Return JSON in this exact shape:
{
  "programName": "string",
  "weeks": number,
  "rationale": "1-2 sentence explanation of the approach",
  "days": [
    {
      "name": "Day 1 — <focus>",
      "exercises": [
        { "phase": "warmup_general|warmup_specific|explosive|compound|hypertrophy|lactic|aerobic|cooldown", "name": "string", "sets": number, "reps": "string", "rpe": number, "rest": "string" }
      ]
    }
  ]
}`;
}

function parseAIJson(text) {
  if (!text) throw new Error("No response content from AI");
  let clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start !== -1 && end !== -1) clean = clean.slice(start, end + 1);
  clean = clean.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  clean = clean.replace(/,(\s*[}\]])/g, "$1"); // strip trailing commas
  try {
    return JSON.parse(clean);
  } catch (e) {
    // Response likely got cut off mid-structure. Trim back to the last complete
    // element and auto-close any open braces/brackets, then retry once.
    let repaired = clean.replace(/,\s*"[^"]*"?\s*:?\s*("[^"]*)?$/, ""); // drop dangling trailing property
    repaired = repaired.replace(/,\s*$/, "");
    const stack = [];
    let inStr = false, esc = false;
    for (const ch of repaired) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{" || ch === "[") stack.push(ch);
      else if (ch === "}" && stack[stack.length - 1] === "{") stack.pop();
      else if (ch === "]" && stack[stack.length - 1] === "[") stack.pop();
    }
    if (inStr) repaired += '"';
    while (stack.length) repaired += stack.pop() === "{" ? "}" : "]";
    return JSON.parse(repaired);
  }
}

// Builds the day/exercise structure with local exerciseIds, matching by name
// against existing exercises (seed library or ones already known locally).
// Used both for freshly-generated AI programs AND for reloading a program from the DB.
function buildDaysWithExerciseIds(rawDays, state) {
  const newExercises = [];
  const days = (rawDays || []).map(d => ({
    id: "d" + Math.random().toString(36).slice(2, 9), name: d.name,
    exercises: (d.exercises || []).map(x => {
      let match = state.exercises.find(e => e.name.toLowerCase() === x.name.toLowerCase());
      if (!match) {
        match = { id: "eai" + Math.random().toString(36).slice(2, 9), name: x.name, phase: x.phase, pattern: "AI-Generated", hasMedia: false };
        newExercises.push(match);
      }
      return { id: "x" + Math.random().toString(36).slice(2, 9), exerciseId: match.id, phase: x.phase, sets: x.sets, reps: x.reps, rpe: x.rpe, rest: x.rest };
    }).sort((a, b) => phaseIndex(a.phase) - phaseIndex(b.phase))
  }));
  return { days, newExercises };
}

// Inverse of the above — turns local exerciseId-based days back into plain
// name-based JSON for saving to the database (so it survives independent of
// this session's locally-generated exercise ids).
function denormalizeDays(days, state) {
  return (days || []).map(d => ({
    name: d.name,
    exercises: (d.exercises || []).map(x => {
      const ex = state.exercises.find(e => e.id === x.exerciseId);
      return { name: ex?.name || "Unknown Exercise", phase: x.phase, sets: x.sets, reps: x.reps, rpe: x.rpe, rest: x.rest };
    })
  }));
}

function applyGeneratedProgram(result, state, intake, programId) {
  const { days, newExercises } = buildDaysWithExerciseIds(result.days, state);
  const newProgram = { id: programId || ("plocal" + Date.now()), name: result.programName, weeks: result.weeks || 6, assignedCount: 1, sport: intake?.["🥊 Sport / Focus"] || "General Fitness", days };
  return {
    ...state,
    programs: [...state.programs, newProgram],
    exercises: [...state.exercises, ...newExercises],
    me: { ...state.me, program: newProgram.id, customProgram: null },
  };
}

// Creates a new program row from a freshly-generated AI result (already name-based JSON).
async function createProgramRow(athleteId, name, weeks, sport, rawDays) {
  const { data, error } = await supabase.from("programs").insert({ athlete_id: athleteId, name, weeks, sport, days: rawDays }).select().single();
  if (error || !data) return null;
  await supabase.from("profiles").update({ active_program_id: data.id }).eq("id", athleteId);
  return data.id;
}

// Updates an existing program row after a manual edit (reorder/swap) — local
// days are in exerciseId form, so they need denormalizing back to plain names first.
async function updateProgramRow(programId, days, state) {
  const { error } = await supabase.from("programs").update({ days: denormalizeDays(days, state) }).eq("id", programId);
  return !error;
}

function AIProgramGenerator({ intake, onGenerated, onClose }) {
  const [status, setStatus] = useState("idle"); // idle | loading | error | done
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState(null);

  const generate = async () => {
    setStatus("loading"); setErrorMsg("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          messages: [{ role: "user", content: buildAIPrompt(intake) }],
        })
      });
      const data = await response.json();
      const textBlock = (data.content || []).find(b => b.type === "text");
      const parsed = parseAIJson(textBlock?.text);
      setResult(parsed);
      setStatus("done");
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong generating your program.");
      setStatus("error");
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="AI Program Generator" wide>
      {status === "idle" && (
        <div className="text-center py-4">
          <div className="rounded-full w-14 h-14 mx-auto flex items-center justify-center mb-4" style={{ background: `${C.orange}22` }}>
            <Bot size={26} style={{ color: C.orange }} />
          </div>
          <p className="text-sm mb-1" style={{ color: C.text }}>Generate a program from this athlete's intake data.</p>
          <p className="text-xs mb-6" style={{ color: C.sub }}>Goals, injuries, sport, schedule, and equipment will all be factored in — with correct phase ordering.</p>
          <Btn className="w-full" icon={Sparkles} onClick={generate}>Generate Program</Btn>
        </div>
      )}
      {status === "loading" && (
        <div className="text-center py-10">
          <Loader2 size={32} className="animate-spin mx-auto mb-4" style={{ color: C.orange }} />
          <p className="text-sm" style={{ color: C.sub }}>Building a program around the athlete's profile...</p>
        </div>
      )}
      {status === "error" && (
        <div className="text-center py-6">
          <AlertCircle size={28} className="mx-auto mb-3" style={{ color: C.red }} />
          <p className="text-sm mb-1" style={{ color: C.text }}>Couldn't generate a program.</p>
          <p className="text-xs mb-5" style={{ color: C.sub }}>{errorMsg}</p>
          <Btn variant="secondary" icon={RefreshCw} onClick={generate}>Try Again</Btn>
        </div>
      )}
      {status === "done" && result && (
        <div>
          <div className="rounded-lg p-3.5 mb-4" style={{ background: `${C.olive}18`, border: `1px solid ${C.olive}55` }}>
            <div className="font-semibold text-sm" style={{ color: C.olive }}>{result.programName}</div>
            <div className="text-xs mt-1" style={{ color: C.text }}>{result.rationale}</div>
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto mb-4">
            {(result.days || []).map((d, i) => (
              <div key={i} className="rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                <div className="text-sm font-semibold mb-1.5" style={{ color: C.text, fontFamily: "Inter" }}>{d.name}</div>
                <div className="space-y-1">
                  {(d.exercises || []).map((x, j) => (
                    <div key={j} className="text-xs flex justify-between" style={{ color: C.sub }}>
                      <span>{x.name}</span>
                      <span className="font-mono shrink-0 ml-2">{x.sets}×{x.reps} RPE{x.rpe}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2.5">
            <Btn variant="secondary" className="flex-1" icon={RefreshCw} onClick={generate}>Regenerate</Btn>
            <Btn className="flex-1" icon={Check} onClick={() => onGenerated(result)}>Use This Program</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ============================================================
// COACH PORTAL
// ============================================================

function CoachDashboard({ state, nav }) {
  const totalAthletes = state.athletes.length;
  const activePrograms = state.programs.length;
  const unread = Object.values(state.messages).flat().filter(m => m.from === "athlete").length;
  const payments = state.payments || { rates: [], clientBilling: {}, methods: [] };
  const monthlyRevenue = state.athletes.reduce((sum, a) => {
    const billing = payments.clientBilling[a.id];
    if (!billing) return sum;
    const rate = payments.rates.find(r => r.id === billing.rateId);
    if (!rate) return sum;
    const amt = parseFloat(rate.amount) || 0;
    if (rate.cycle === "Monthly") return sum + amt;
    if (rate.cycle === "Weekly") return sum + amt * 4;
    if (rate.cycle === "Quarterly") return sum + amt / 3;
    return sum + amt;
  }, 0);

  return (
    <div className="pb-28">
      <TopBar title="Dashboard" onLogout={nav.logout} />
      <div className="px-5 pt-5">
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <StatCard icon={Users} label="Athletes" value={totalAthletes} />
          <StatCard icon={ClipboardList} label="Programs" value={activePrograms} accent={C.blue} />
        </div>
        <button onClick={() => nav.go("coach-payments")} className="w-full rounded-xl p-3.5 mb-6 flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, ${C.gradFrom}33, ${C.gradTo}22)`, border: `1px solid ${C.orange}44` }}>
          <div>
            <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.sub }}>Est. Monthly Revenue</div>
            <div className="font-mono font-bold text-2xl mt-0.5" style={{ color: C.orange }}>${monthlyRevenue.toLocaleString()}</div>
          </div>
          <ChevronRight size={18} style={{ color: C.orange }} />
        </button>

        <ChalkDivider label="Recent Activity" />
        <div className="space-y-2.5">
          {state.athletes.slice(0, 4).map(a => (
            <button key={a.id} onClick={() => nav.go("coach-athlete-detail", a.id)} className="w-full rounded-xl p-3.5 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <Avatar initials={a.avatar} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate" style={{ color: C.text }}>{a.name}</div>
                <div className="text-xs truncate" style={{ color: C.sub }}>{a.sport} · Active {a.lastActive}</div>
              </div>
              {a.streak > 0 && <div className="flex items-center gap-1 text-xs font-mono font-bold shrink-0" style={{ color: C.amber }}><Flame size={14} /> {a.streak}</div>}
            </button>
          ))}
        </div>

        <ChalkDivider label="Quick Actions" />
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => nav.go("coach-programs")} className="rounded-xl p-4 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <ClipboardList size={20} style={{ color: C.orange }} className="mb-2" />
            <div className="text-sm font-semibold" style={{ color: C.text }}>Build Program</div>
          </button>
          <button onClick={() => nav.go("coach-athletes")} className="rounded-xl p-4 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <Users size={20} style={{ color: C.blue }} className="mb-2" />
            <div className="text-sm font-semibold" style={{ color: C.text }}>Manage Roster</div>
          </button>
        </div>
      </div>
    </div>
  );
}

function CoachAthletes({ state, setState, nav }) {
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [assignOpen, setAssignOpen] = useState(null);

  const filtered = state.athletes.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  const sendInvite = () => {
    if (!inviteEmail) return;
    const newA = { id: "a" + Date.now(), name: inviteEmail.split("@")[0], sport: "Pending profile", streak: 0, lastActive: "Invited", avatar: "??", program: null, injuries: [], goals: [] };
    setState(s => ({ ...s, athletes: [...s.athletes, newA] }));
    setInviteEmail(""); setInviteOpen(false);
  };

  const assignProgram = (athleteId, programId) => {
    setState(s => ({ ...s, athletes: s.athletes.map(a => a.id === athleteId ? { ...a, program: programId } : a) }));
    setAssignOpen(null);
  };

  return (
    <div className="pb-28">
      <TopBar title="Athletes" onLogout={nav.logout} right={<button onClick={() => setInviteOpen(true)}><Plus size={20} style={{ color: C.orange }} /></button>} />
      <div className="px-5 pt-4">
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.faint }} />
          <input style={{ ...inputStyle, paddingLeft: 36 }} placeholder="Search athletes..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="space-y-2.5">
          {filtered.map(a => {
            const prog = state.programs.find(p => p.id === a.program);
            return (
              <div key={a.id} className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <button onClick={() => nav.go("coach-athlete-detail", a.id)} className="w-full flex items-center gap-3 text-left">
                  <Avatar initials={a.avatar} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate" style={{ color: C.text }}>{a.name}</div>
                    <div className="text-xs truncate" style={{ color: C.sub }}>{a.sport}</div>
                  </div>
                  {a.streak > 0 && <div className="flex items-center gap-1 text-xs font-mono font-bold shrink-0" style={{ color: C.amber }}><Flame size={13} />{a.streak}</div>}
                  <ChevronRight size={16} style={{ color: C.faint }} className="shrink-0" />
                </button>
                <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
                  <span className="text-xs truncate" style={{ color: prog ? C.olive : C.sub }}>{prog ? prog.name : "No program assigned"}</span>
                  <button onClick={() => setAssignOpen(a.id)} className="text-xs font-semibold shrink-0 ml-2" style={{ color: C.orange }}>Assign</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Athlete">
        <Field label="Email address"><input style={inputStyle} placeholder="athlete@email.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} /></Field>
        <Btn className="w-full" onClick={sendInvite} icon={Send}>Send Invite</Btn>
      </Modal>

      <Modal open={!!assignOpen} onClose={() => setAssignOpen(null)} title="Assign Program">
        <div className="space-y-2.5">
          {state.programs.map(p => (
            <button key={p.id} onClick={() => assignProgram(assignOpen, p.id)} className="w-full text-left rounded-lg p-3.5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
              <div className="font-semibold text-sm" style={{ color: C.text }}>{p.name}</div>
              <div className="text-xs mt-0.5" style={{ color: C.sub }}>{p.weeks} weeks · {p.days.length} days/cycle</div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// Coach view of one athlete: metrics, results, AND per-athlete program editing
function CoachAthleteDetail({ state, setState, nav, athleteId }) {
  const athlete = state.athletes.find(a => a.id === athleteId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeDayId, setActiveDayId] = useState(null);
  const [swapTarget, setSwapTarget] = useState(null);
  const exById = id => state.exercises.find(e => e.id === id);

  if (!athlete) return null;

  // per-athlete override: clone program into athlete.customProgram on first edit
  const program = athlete.customProgram || state.programs.find(p => p.id === athlete.program);

  const ensureCustom = (updater) => {
    setState(s => ({
      ...s,
      athletes: s.athletes.map(a => {
        if (a.id !== athleteId) return a;
        const base = a.customProgram || state.programs.find(p => p.id === a.program);
        if (!base) return a;
        return { ...a, customProgram: updater(JSON.parse(JSON.stringify(base))) };
      })
    }));
  };

  const addExerciseToDay = (dayId, exercise) => {
    ensureCustom(prog => ({
      ...prog, days: prog.days.map(d => d.id === dayId ? { ...d, exercises: [...d.exercises, { id: "x" + Date.now(), exerciseId: exercise.id, phase: exercise.phase, sets: 3, reps: "10", rpe: 7, rest: "90s" }] } : d)
    }));
  };
  const removeExercise = (dayId, xId) => {
    ensureCustom(prog => ({ ...prog, days: prog.days.map(d => d.id === dayId ? { ...d, exercises: d.exercises.filter(x => x.id !== xId) } : d) }));
  };
  const deleteExerciseGlobally = (exerciseId) => {
    setState(s => ({
      ...s,
      exercises: s.exercises.filter(e => e.id !== exerciseId),
      programs: s.programs.map(p => ({ ...p, days: p.days.map(d => ({ ...d, exercises: d.exercises.filter(x => x.exerciseId !== exerciseId) })) })),
      athletes: s.athletes.map(a => a.customProgram ? { ...a, customProgram: { ...a.customProgram, days: a.customProgram.days.map(d => ({ ...d, exercises: d.exercises.filter(x => x.exerciseId !== exerciseId) })) } } : a),
    }));
  };
  const [removeTarget, setRemoveTarget] = useState(null);
  const updateExerciseField = (dayId, xId, field, value) => {
    ensureCustom(prog => ({ ...prog, days: prog.days.map(d => d.id === dayId ? { ...d, exercises: d.exercises.map(x => x.id === xId ? { ...x, [field]: value } : x) } : d) }));
  };
  const swapExercise = (dayId, xId, newExercise) => {
    ensureCustom(prog => ({ ...prog, days: prog.days.map(d => d.id === dayId ? { ...d, exercises: d.exercises.map(x => x.id === xId ? { ...x, exerciseId: newExercise.id, phase: newExercise.phase } : x) } : d) }));
  };

  const sortedExercises = (day) => [...day.exercises].sort((a, b) => phaseIndex(a.phase) - phaseIndex(b.phase));

  return (
    <div className="pb-28">
      <TopBar title={athlete.name} right={<button onClick={() => nav.go("coach-athletes")} style={{ color: C.sub }}><X size={20} /></button>} />
      <div className="px-5 pt-4">
        <div className="flex items-center gap-3 mb-5">
          <Avatar initials={athlete.avatar} size={56} />
          <div className="min-w-0">
            <div className="font-semibold" style={{ color: C.text }}>{athlete.name}</div>
            <div className="text-xs" style={{ color: C.sub }}>{athlete.sport} · {athlete.sex === "male" ? "Male" : "Female"}</div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {(athlete.goals || []).map(g => <span key={g} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${C.blue}22`, color: C.blue }}>{g}</span>)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <StatCard icon={Scale} label="⚖️ Weight" value={`${kgToLb(athlete.weightKg)}`} sub="lb" />
          <StatCard icon={Ruler} label="📏 Height" value={(() => { const { ft, inch } = cmToFtIn(athlete.heightCm); return `${ft}'${inch}"`; })()} accent={C.blue} />
          <StatCard icon={Flame} label="Streak" value={athlete.streak} accent={C.amber} />
        </div>

        {(athlete.goals || []).length > 0 && (
          <div className="rounded-xl p-3.5 mb-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.sub }}>Client Goals</div>
            <div className="flex flex-wrap gap-2">
              {athlete.goals.map(g => <span key={g} className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: `${C.orange}22`, color: C.orange }}>{g}</span>)}
            </div>
          </div>
        )}

        {/* Weekly accountability tracker */}
        {(() => {
          const today = new Date(); const dow = today.getDay();
          const weekDays = Array.from({length:7},(_,i)=>{const d=new Date(today);d.setDate(today.getDate()-dow+i);return d;});
          const loggedDates = new Set(state.workoutLogs.map(l=>l.date));
          const dayLabels=["S","M","T","W","T","F","S"];
          const completed=weekDays.filter(d=>loggedDates.has(d.toISOString().slice(0,10))).length;
          return (
            <div className="rounded-xl p-4 mb-5" style={{background:C.panel,border:`1px solid ${C.border}`}}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold" style={{color:C.text}}>This Week's Accountability</div>
                <div className="text-xs font-mono font-semibold" style={{color:completed>=3?C.olive:C.sub}}>{completed}/7</div>
              </div>
              <div className="flex gap-1.5 justify-between">
                {weekDays.map((d,i)=>{const done=loggedDates.has(d.toISOString().slice(0,10));return(
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-[9px]" style={{color:C.faint}}>{dayLabels[i]}</div>
                    <div className="w-full aspect-square rounded-lg flex items-center justify-center" style={{background:done?C.olive:C.border}}>
                      {done&&<CheckCircle2 size={12} style={{color:"#fff"}}/>}
                    </div>
                  </div>
                );})}
              </div>
            </div>
          );
        })()}

        {athlete.injuries?.length > 0 && (
          <div className="rounded-lg p-3 mb-5 flex items-start gap-2" style={{ background: `${C.red}18`, border: `1px solid ${C.red}55` }}>
            <AlertCircle size={15} style={{ color: C.red }} className="mt-0.5 shrink-0" />
            <div className="text-xs" style={{ color: C.red }}>Injury flags: {athlete.injuries.join(", ")}</div>
          </div>
        )}

        {/* Billing status */}
        {(() => {
          const payments = state.payments || { rates: [], clientBilling: {}, methods: [] };
          const billing = payments.clientBilling[athlete.id];
          const rate = billing ? payments.rates.find(r => r.id === billing.rateId) : null;
          return (
            <div className="rounded-xl p-4 mb-5" style={{ background: C.panel, border: `1px solid ${rate ? C.olive + "88" : C.border}` }}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.sub }}>Billing</div>
                <button onClick={() => nav.go("coach-payments")} className="text-xs font-semibold" style={{ color: C.orange }}>Manage →</button>
              </div>
              {rate ? (
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: C.text }}>{rate.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: C.sub }}>{rate.cycle} · Next due {formatLogDate(billing.nextDue)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-xl" style={{ color: C.olive }}>${rate.amount}</div>
                      <div className="text-[10px]" style={{ color: C.faint }}>{billing.paidCount || 0} paid</div>
                    </div>
                  </div>
                  {(payments.methods || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {payments.methods.map(m => <span key={m} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${C.blue}22`, color: C.blue }}>{m}</span>)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: C.faint }}>No billing set up for this client</span>
                  <button onClick={() => nav.go("coach-payments")} className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: `${C.orange}18`, color: C.orange }}>Set Up</button>
                </div>
              )}
            </div>
          );
        })()}

        <ChalkDivider label="Progress History" />
        <div className="rounded-xl p-4 mb-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          {state.progress.length === 0 ? (
            <div className="text-center text-xs py-6" style={{ color: C.faint }}>No progress entries logged yet.</div>
          ) : (
          <div className="flex items-end gap-2 h-24">
            {state.progress.map((d, i) => {
              const vals = state.progress.map(p => p.weightKg);
              const max = Math.max(...vals), min = Math.min(...vals);
              const h = ((d.weightKg - min + 1) / (max - min + 2)) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-md" style={{ height: `${h}%`, background: i === state.progress.length - 1 ? C.orange : C.steel }} />
                  <span className="text-[8px]" style={{ color: C.faint }}>{d.date.split(" ")[1] || d.date}</span>
                </div>
              );
            })}
          </div>
          )}
        </div>

        <ChalkDivider label="Assigned Program — Edit" />
        {!program && <div className="text-sm text-center py-6" style={{ color: C.sub }}>No program assigned yet.</div>}
        {program && (
          <div className="space-y-4">
            {program.days.map(day => (
              <div key={day.id} className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="font-semibold mb-3" style={{ fontFamily: "Inter", color: C.text }}>{day.name}</div>
                <div className="space-y-2">
                  {sortedExercises(day).map(x => {
                    const ex = exById(x.exerciseId);
                    const phaseLabel = PHASES.find(p => p.key === x.phase)?.short;
                    return (
                      <div key={x.id} className="rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0" style={{ background: `${C.orange}22`, color: C.orange }}>{phaseLabel}</span>
                          <span className="text-sm font-medium truncate flex-1" style={{ color: C.text }}>{ex?.name}</span>
                          <button onClick={() => setSwapTarget({ dayId: day.id, x })}><RotateCcw size={14} style={{ color: C.blue }} /></button>
                          <button onClick={() => setRemoveTarget({ dayId: day.id, xId: x.id, exerciseId: x.exerciseId, name: ex?.name || "Exercise" })}><Trash2 size={14} style={{ color: C.sub }} /></button>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {["sets", "reps", "rpe", "rest"].map(field => (
                            <input key={field} value={x[field]} onChange={e => updateExerciseField(day.id, x.id, field, field === "sets" || field === "rpe" ? Number(e.target.value) || 0 : e.target.value)}
                              className="text-center font-mono text-xs rounded py-1.5" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                          ))}
                        </div>
                        <div className="grid grid-cols-4 gap-1.5 mt-1">
                          {["Sets", "Reps", "RPE", "Rest"].map(l => <div key={l} className="text-center text-[8px]" style={{ color: C.faint }}>{l}</div>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => { setActiveDayId(day.id); setPickerOpen(true); }}
                  className="w-full mt-3 rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
                  style={{ background: `${C.orange}18`, color: C.orange, border: `1px dashed ${C.orange}66` }}>
                  <BookOpen size={15} /> Add From Library
                </button>
              </div>
            ))}
            <div className="text-xs text-center" style={{ color: C.faint }}>Edits here apply only to {athlete.name.split(" ")[0]} — the shared program template is unaffected.</div>
          </div>
        )}
      </div>

      <ExercisePickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} exercises={state.exercises} onPick={(ex) => addExerciseToDay(activeDayId, ex)} />
      <ExerciseSwapModal open={!!swapTarget} onClose={() => setSwapTarget(null)} currentExercise={swapTarget?.x} exercises={state.exercises}
        onSwap={(newEx) => swapExercise(swapTarget.dayId, swapTarget.x.id, newEx)} />
      <RemoveExerciseModal open={!!removeTarget} onClose={() => setRemoveTarget(null)} exerciseName={removeTarget?.name}
        onRemoveFromDay={() => { removeExercise(removeTarget.dayId, removeTarget.xId); setRemoveTarget(null); }}
        onDeleteFromLibrary={() => { deleteExerciseGlobally(removeTarget.exerciseId); setRemoveTarget(null); }} />
    </div>
  );
}

function RemoveExerciseModal({ open, onClose, exerciseName, onRemoveFromDay, onDeleteFromLibrary }) {
  return (
    <Modal open={open} onClose={onClose} title="Remove Exercise">
      <p className="text-sm mb-5" style={{ color: C.text }}>
        What do you want to do with <span className="font-semibold">{exerciseName}</span>?
      </p>
      <div className="space-y-2.5">
        <button onClick={onRemoveFromDay} className="w-full text-left rounded-lg p-3.5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
          <div className="text-sm font-medium" style={{ color: C.text }}>Remove from this day</div>
          <div className="text-xs mt-0.5" style={{ color: C.sub }}>Stays in the exercise library, just taken out of this workout.</div>
        </button>
        <button onClick={onDeleteFromLibrary} className="w-full text-left rounded-lg p-3.5" style={{ background: `${C.red}14`, border: `1px solid ${C.red}55` }}>
          <div className="text-sm font-medium" style={{ color: C.red }}>Delete from library entirely</div>
          <div className="text-xs mt-0.5" style={{ color: C.red }}>Removes it everywhere — every program and day that uses it.</div>
        </button>
      </div>
      <Btn variant="ghost" className="w-full mt-3" onClick={onClose}>Cancel</Btn>
    </Modal>
  );
}

function ExercisePickerModal({ open, onClose, onPick, exercises }) {
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const list = exercises.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) && (phaseFilter === "all" || e.phase === phaseFilter));

  return (
    <Modal open={open} onClose={onClose} title="Exercise Library" wide>
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        <Pill active={phaseFilter === "all"} onClick={() => setPhaseFilter("all")}>All</Pill>
        {PHASES.map(p => <Pill key={p.key} active={phaseFilter === p.key} onClick={() => setPhaseFilter(p.key)}>{p.short}</Pill>)}
      </div>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.faint }} />
        <input style={{ ...inputStyle, paddingLeft: 36 }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {list.map(ex => (
          <button key={ex.id} onClick={() => { onPick(ex); onClose(); }} className="w-full text-left rounded-lg p-3 flex items-center gap-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
            <div className="rounded-md w-10 h-10 flex items-center justify-center shrink-0 overflow-hidden" style={{ background: C.border }}>{exerciseImage(ex.name) ? <img src={exerciseImage(ex.name)} alt={ex.name} className="w-full h-full object-cover" /> : <Dumbbell size={16} style={{ color: C.faint }} />}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: C.text }}>{ex.name}</div>
              <div className="text-xs truncate" style={{ color: C.sub }}>{ex.pattern}</div>
            </div>
            {ex.hasMedia && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${C.olive}22`, color: C.olive }}>Media</span>}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function CoachPrograms({ state, setState, nav }) {
  const [editing, setEditing] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeDayId, setActiveDayId] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const exById = id => state.exercises.find(e => e.id === id);

  const createProgram = () => {
    const np = { id: "p" + Date.now(), name: "New Program", weeks: 4, assignedCount: 0, sport: "General Fitness", days: [{ id: "d" + Date.now(), name: "Day 1", exercises: [] }] };
    setState(s => ({ ...s, programs: [...s.programs, np] }));
    setEditing(np.id);
  };

  const prog = state.programs.find(p => p.id === editing);
  const addDay = () => setState(s => ({ ...s, programs: s.programs.map(p => p.id === editing ? { ...p, days: [...p.days, { id: "d" + Date.now(), name: `Day ${p.days.length + 1}`, exercises: [] }] } : p) }));
  const addExerciseToDay = (dayId, exercise) => {
    setState(s => ({ ...s, programs: s.programs.map(p => p.id === editing ? { ...p, days: p.days.map(d => d.id === dayId ? { ...d, exercises: [...d.exercises, { id: "x" + Date.now(), exerciseId: exercise.id, phase: exercise.phase, sets: 3, reps: "10", rpe: 7, rest: "90s" }] } : d) } : p) }));
  };
  const removeExercise = (dayId, xId) => {
    setState(s => ({ ...s, programs: s.programs.map(p => p.id === editing ? { ...p, days: p.days.map(d => d.id === dayId ? { ...d, exercises: d.exercises.filter(x => x.id !== xId) } : d) } : p) }));
  };
  const deleteExerciseGlobally = (exerciseId) => {
    setState(s => ({
      ...s,
      exercises: s.exercises.filter(e => e.id !== exerciseId),
      programs: s.programs.map(p => ({ ...p, days: p.days.map(d => ({ ...d, exercises: d.exercises.filter(x => x.exerciseId !== exerciseId) })) })),
    }));
  };
  const [removeTarget, setRemoveTarget] = useState(null);

  const applyAIProgram = (result) => {
    // map AI exercise names to nearest known exercise or create ad-hoc entries
    const days = (result.days || []).map(d => ({
      id: "d" + Math.random().toString(36).slice(2, 9), name: d.name,
      exercises: (d.exercises || []).map(x => {
        let match = state.exercises.find(e => e.name.toLowerCase() === x.name.toLowerCase());
        if (!match) {
          match = { id: "eai" + Math.random().toString(36).slice(2, 9), name: x.name, phase: x.phase, pattern: "AI-Generated", hasMedia: false };
          setState(s => ({ ...s, exercises: [...s.exercises, match] }));
        }
        return { id: "x" + Math.random().toString(36).slice(2, 9), exerciseId: match.id, phase: x.phase, sets: x.sets, reps: x.reps, rpe: x.rpe, rest: x.rest };
      })
    }));
    const np = { id: "p" + Date.now(), name: result.programName, weeks: result.weeks || 4, assignedCount: 0, sport: "AI-Generated", days };
    setState(s => ({ ...s, programs: [...s.programs, np] }));
    setAiOpen(false);
    setEditing(np.id);
  };

  const sortedExercises = (day) => [...day.exercises].sort((a, b) => phaseIndex(a.phase) - phaseIndex(b.phase));

  if (prog) {
    return (
      <div className="pb-28">
        <TopBar title={prog.name} right={<button onClick={() => setEditing(null)} style={{ color: C.sub }}><X size={20} /></button>} />
        <div className="px-5 pt-4 space-y-5">
          {prog.days.map(day => (
            <div key={day.id} className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <div className="font-semibold mb-3" style={{ fontFamily: "Inter", color: C.text }}>{day.name}</div>
              <div className="space-y-2">
                {sortedExercises(day).map(x => {
                  const ex = exById(x.exerciseId);
                  const phaseLabel = PHASES.find(p => p.key === x.phase)?.short;
                  return (
                    <div key={x.id} className="rounded-lg p-3 flex items-center gap-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0" style={{ background: `${C.orange}22`, color: C.orange }}>{phaseLabel}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: C.text }}>{ex?.name || "Exercise"}</div>
                        <div className="text-xs font-mono mt-0.5" style={{ color: C.sub }}>{x.sets}×{x.reps} · RPE {x.rpe} · rest {x.rest}</div>
                      </div>
                      <button onClick={() => setRemoveTarget({ dayId: day.id, xId: x.id, exerciseId: x.exerciseId, name: ex?.name || "Exercise" })} className="shrink-0"><Trash2 size={15} style={{ color: C.sub }} /></button>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => { setActiveDayId(day.id); setPickerOpen(true); }}
                className="w-full mt-3 rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: `${C.orange}18`, color: C.orange, border: `1px dashed ${C.orange}66` }}>
                <BookOpen size={15} /> From Library
              </button>
            </div>
          ))}
          <Btn variant="secondary" className="w-full" icon={Plus} onClick={addDay}>Add Training Day</Btn>
        </div>
        <ExercisePickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} exercises={state.exercises} onPick={(ex) => addExerciseToDay(activeDayId, ex)} />
        <RemoveExerciseModal open={!!removeTarget} onClose={() => setRemoveTarget(null)} exerciseName={removeTarget?.name}
          onRemoveFromDay={() => { removeExercise(removeTarget.dayId, removeTarget.xId); setRemoveTarget(null); }}
          onDeleteFromLibrary={() => { deleteExerciseGlobally(removeTarget.exerciseId); setRemoveTarget(null); }} />
      </div>
    );
  }

  return (
    <div className="pb-28">
      <TopBar title="Programs" right={<button onClick={createProgram}><Plus size={20} style={{ color: C.orange }} /></button>} />
      <div className="px-5 pt-4">
        <button onClick={() => setAiOpen(true)} className="w-full rounded-xl p-4 mb-4 flex items-center gap-3 text-left" style={{ background: `linear-gradient(135deg, ${C.orange}22, ${C.steel}33)`, border: `1px solid ${C.orange}55` }}>
          <div className="rounded-lg p-2.5 shrink-0" style={{ background: `${C.orange}33` }}><Sparkles size={20} style={{ color: C.orange }} /></div>
          <div className="min-w-0">
            <div className="font-semibold text-sm" style={{ color: C.text }}>Generate with AI</div>
            <div className="text-xs mt-0.5" style={{ color: C.sub }}>Build a program from an athlete's intake automatically</div>
          </div>
        </button>
        <div className="space-y-3">
          {state.programs.map(p => (
            <button key={p.id} onClick={() => setEditing(p.id)} className="w-full text-left rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold truncate" style={{ color: C.text, fontFamily: "Inter" }}>{p.name}</div>
                <ChevronRight size={18} style={{ color: C.faint }} className="shrink-0" />
              </div>
              <div className="text-xs mt-1.5" style={{ color: C.sub }}>{p.weeks} weeks · {p.days.length} days/cycle · {p.assignedCount} assigned</div>
            </button>
          ))}
        </div>
      </div>
      {aiOpen && (
        <AIProgramGenerator
          intake={{ "🥊 Sport / Focus": "MMA", isFighter: true, experience: "Intermediate (1-3 years)", goals: ["Athletic Performance"], injuries: ["None currently"], daysPerWeek: 4, equipment: ["Full gym access"], heightCm: 178, weightLb: 175 }}
          onGenerated={applyAIProgram} onClose={() => setAiOpen(false)} />
      )}
    </div>
  );
}

const PAYMENT_METHODS = ["PayPal", "Venmo", "Cash App", "Zelle", "Bank Transfer", "Visa/Debit", "Stripe"];
const BILLING_CYCLES = ["Monthly", "Per Session", "Quarterly", "Weekly", "One-Time"];

function CoachPayments({ state, setState, nav }) {
  const payments = state.payments || { rates: [], clientBilling: {}, methods: [] };
  const [rateOpen, setRateOpen] = useState(false);
  const [newRate, setNewRate] = useState({ label: "", amount: "", cycle: "Monthly" });
  const [methodOpen, setMethodOpen] = useState(false);
  const [invoiceAthleteId, setInvoiceAthleteId] = useState(null);
  const [invoiceRateId, setInvoiceRateId] = useState(null);

  const updatePayments = (updater) => setState(s => ({ ...s, payments: updater(s.payments || { rates: [], clientBilling: {}, methods: [] }) }));

  const addRate = () => {
    if (!newRate.label || !newRate.amount) return;
    updatePayments(p => ({ ...p, rates: [...p.rates, { id: "r" + Date.now(), ...newRate }] }));
    setNewRate({ label: "", amount: "", cycle: "Monthly" });
    setRateOpen(false);
  };

  const deleteRate = (id) => updatePayments(p => ({ ...p, rates: p.rates.filter(r => r.id !== id) }));

  const toggleMethod = (method) => updatePayments(p => ({
    ...p, methods: p.methods.includes(method) ? p.methods.filter(m => m !== method) : [...p.methods, method]
  }));

  const assignBilling = (athleteId, rateId) => {
    const rate = payments.rates.find(r => r.id === rateId);
    updatePayments(p => ({ ...p, clientBilling: { ...p.clientBilling, [athleteId]: { rateId, assignedAt: todayISO(), status: "Active", nextDue: getNextDue(rate?.cycle), paidCount: 0 } } }));
    setInvoiceAthleteId(null); setInvoiceRateId(null);
  };

  const getNextDue = (cycle) => {
    const d = new Date();
    if (cycle === "Weekly") d.setDate(d.getDate() + 7);
    else if (cycle === "Monthly") d.setMonth(d.getMonth() + 1);
    else if (cycle === "Quarterly") d.setMonth(d.getMonth() + 3);
    else d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  const markPaid = (athleteId) => updatePayments(p => ({
    ...p, clientBilling: { ...p.clientBilling, [athleteId]: { ...p.clientBilling[athleteId], paidCount: (p.clientBilling[athleteId]?.paidCount || 0) + 1, lastPaid: todayISO(), nextDue: getNextDue(payments.rates.find(r => r.id === p.clientBilling[athleteId]?.rateId)?.cycle) } }
  }));

  // Revenue calculations
  const monthlyRevenue = state.athletes.reduce((sum, a) => {
    const billing = payments.clientBilling[a.id];
    if (!billing) return sum;
    const rate = payments.rates.find(r => r.id === billing.rateId);
    if (!rate) return sum;
    const amt = parseFloat(rate.amount) || 0;
    if (rate.cycle === "Monthly") return sum + amt;
    if (rate.cycle === "Weekly") return sum + amt * 4;
    if (rate.cycle === "Quarterly") return sum + amt / 3;
    if (rate.cycle === "Per Session") return sum + amt * 4; // estimate
    return sum + amt;
  }, 0);

  const billedCount = Object.keys(payments.clientBilling).length;

  return (
    <div className="pb-28">
      <TopBar title="Payments" onLogout={nav.logout} />
      <div className="px-5 pt-5">

        {/* Revenue summary */}
        <div className="rounded-2xl p-5 mb-5" style={{ background: `linear-gradient(135deg, ${C.gradFrom}, ${C.gradTo})` }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#ffffff99" }}>Est. Monthly Revenue</div>
          <div className="text-4xl font-bold" style={{ fontFamily: "JetBrains Mono", color: "#fff" }}>${monthlyRevenue.toLocaleString()}</div>
          <div className="text-sm mt-1" style={{ color: "#ffffffcc" }}>{billedCount} of {state.athletes.length} clients billed</div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatCard icon={Users} label="Billed Clients" value={billedCount} accent={C.orange} />
          <StatCard icon={Award} label="Unbilled" value={state.athletes.length - billedCount} accent={C.amber} />
        </div>

        {/* Payment methods */}
        <ChalkDivider label="Accept Payments Via" />
        <div className="flex flex-wrap gap-2 mb-5">
          {PAYMENT_METHODS.map(m => (
            <button key={m} onClick={() => toggleMethod(m)} className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: payments.methods.includes(m) ? `${C.orange}22` : C.panel, color: payments.methods.includes(m) ? C.orange : C.sub, border: `1px solid ${payments.methods.includes(m) ? C.orange : C.border}` }}>
              {m}
            </button>
          ))}
        </div>

        {/* Rates */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.sub }}>My Rates</div>
          <button onClick={() => setRateOpen(true)} className="text-xs font-semibold" style={{ color: C.orange }}>+ Add Rate</button>
        </div>
        {payments.rates.length === 0 ? (
          <div className="rounded-xl p-4 text-center mb-5" style={{ background: C.panel, border: `1px dashed ${C.border}` }}>
            <div className="text-sm" style={{ color: C.faint }}>No rates set yet. Add a rate to start billing clients.</div>
          </div>
        ) : (
          <div className="space-y-2.5 mb-5">
            {payments.rates.map(r => (
              <div key={r.id} className="rounded-xl p-3.5 flex items-center gap-3" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: C.text }}>{r.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: C.sub }}>{r.cycle}</div>
                </div>
                <div className="font-mono font-bold text-lg" style={{ color: C.orange }}>${r.amount}</div>
                <button onClick={() => deleteRate(r.id)}><Trash2 size={15} style={{ color: C.faint }} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Client billing */}
        <ChalkDivider label="Client Billing" />
        <div className="space-y-2.5">
          {state.athletes.map(a => {
            const billing = payments.clientBilling[a.id];
            const rate = billing ? payments.rates.find(r => r.id === billing.rateId) : null;
            return (
              <div key={a.id} className="rounded-xl p-3.5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-3 mb-2.5">
                  <Avatar initials={a.avatar} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: C.text }}>{a.name}</div>
                    {rate ? (
                      <div className="text-xs" style={{ color: C.olive }}>
                        ${rate.amount} / {rate.cycle} · Next due {formatLogDate(billing.nextDue)}
                      </div>
                    ) : (
                      <div className="text-xs" style={{ color: C.faint }}>No billing assigned</div>
                    )}
                  </div>
                  {rate && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${C.olive}22`, color: C.olive }}>
                      {billing.status}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setInvoiceAthleteId(a.id)} className="flex-1 text-xs font-semibold py-2 rounded-lg"
                    style={{ background: `${C.orange}18`, color: C.orange }}>
                    {rate ? "Update Billing" : "Assign Rate"}
                  </button>
                  {rate && (
                    <button onClick={() => markPaid(a.id)} className="flex-1 text-xs font-semibold py-2 rounded-lg"
                      style={{ background: `${C.olive}18`, color: C.olive }}>
                      Mark Paid ✓
                    </button>
                  )}
                </div>
                {billing?.paidCount > 0 && (
                  <div className="text-[10px] mt-1.5 text-center" style={{ color: C.faint }}>{billing.paidCount} payment{billing.paidCount > 1 ? "s" : ""} received · Last {formatLogDate(billing.lastPaid)}</div>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {/* Add Rate Modal */}
      <Modal open={rateOpen} onClose={() => setRateOpen(false)} title="Add Rate">
        <Field label="Rate name">
          <input style={inputStyle} placeholder="e.g. Monthly Coaching, Drop-in Session" value={newRate.label} onChange={e => setNewRate(r => ({ ...r, label: e.target.value }))} />
        </Field>
        <Field label="Amount ($)">
          <input style={inputStyle} type="number" placeholder="150" value={newRate.amount} onChange={e => setNewRate(r => ({ ...r, amount: e.target.value }))} />
        </Field>
        <Field label="Billing cycle">
          <div className="grid grid-cols-2 gap-2">
            {BILLING_CYCLES.map(c => (
              <button key={c} onClick={() => setNewRate(r => ({ ...r, cycle: c }))} className="rounded-lg p-2.5 text-sm"
                style={{ background: newRate.cycle === c ? `${C.orange}18` : C.bg, border: `1px solid ${newRate.cycle === c ? C.orange : C.border}`, color: newRate.cycle === c ? C.orange : C.text }}>
                {c}
              </button>
            ))}
          </div>
        </Field>
        <Btn className="w-full" disabled={!newRate.label || !newRate.amount} onClick={addRate} icon={Plus}>Save Rate</Btn>
      </Modal>

      {/* Assign Rate to Client Modal */}
      <Modal open={!!invoiceAthleteId} onClose={() => setInvoiceAthleteId(null)} title="Assign Billing">
        <p className="text-sm mb-4" style={{ color: C.sub }}>
          Select a rate to assign to {state.athletes.find(a => a.id === invoiceAthleteId)?.name}.
        </p>
        {payments.rates.length === 0 ? (
          <div className="text-sm text-center py-4" style={{ color: C.faint }}>No rates set up yet. Add a rate first.</div>
        ) : (
          <div className="space-y-2 mb-4">
            {payments.rates.map(r => (
              <button key={r.id} onClick={() => setInvoiceRateId(r.id)} className="w-full text-left rounded-lg p-3.5 flex items-center justify-between"
                style={{ background: invoiceRateId === r.id ? `${C.orange}18` : C.bg, border: `1px solid ${invoiceRateId === r.id ? C.orange : C.border}` }}>
                <div>
                  <div className="text-sm font-semibold" style={{ color: C.text }}>{r.label}</div>
                  <div className="text-xs" style={{ color: C.sub }}>{r.cycle}</div>
                </div>
                <div className="font-mono font-bold" style={{ color: C.orange }}>${r.amount}</div>
              </button>
            ))}
          </div>
        )}
        <Btn className="w-full" disabled={!invoiceRateId} onClick={() => assignBilling(invoiceAthleteId, invoiceRateId)} icon={Check}>Assign & Activate</Btn>
        <div className="mt-3 text-xs text-center" style={{ color: C.faint }}>
          Payment links will direct clients to your {payments.methods.join(" / ") || "preferred payment method"}.
        </div>
      </Modal>
    </div>
  );
}

function CoachMessages({ state, setState, nav }) {
  const [activeId, setActiveId] = useState(state.athletes[0]?.id);
  const [draft, setDraft] = useState("");
  const active = state.athletes.find(a => a.id === activeId);
  const thread = state.messages[activeId] || [];
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread.length, activeId]);

  const send = () => {
    if (!draft.trim()) return;
    setState(s => ({ ...s, messages: { ...s.messages, [activeId]: [...(s.messages[activeId] || []), { id: "m" + Date.now(), from: "coach", text: draft, time: "Now" }] } }));
    setDraft("");
  };

  return (
    <div className="flex flex-col h-screen pb-16">
      <TopBar title="Messages" onLogout={nav.logout} />
      <div className="flex gap-2 px-3 py-3 overflow-x-auto shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        {state.athletes.map(a => (
          <button key={a.id} onClick={() => setActiveId(a.id)} className="flex flex-col items-center gap-1 shrink-0 px-1">
            <Avatar initials={a.avatar} size={44} accent={activeId === a.id ? C.orange : "#5C6066"} />
            <span className="text-[10px] truncate max-w-[60px]" style={{ color: activeId === a.id ? C.text : C.sub }}>{a.name.split(" ")[0]}</span>
          </button>
        ))}
      </div>
      {state.athletes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <div>
            <div className="text-sm font-semibold mb-1" style={{ color: C.text }}>No athletes yet</div>
            <p className="text-xs" style={{ color: C.sub }}>Once someone accepts your invite and joins your roster, you'll be able to message them here.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {thread.length === 0 && <div className="text-center text-sm mt-10" style={{ color: C.faint }}>No messages yet with {active?.name}.</div>}
            {thread.map(m => (
              <div key={m.id} className={`flex ${m.from === "coach" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[75%] rounded-2xl px-3.5 py-2.5" style={{ background: m.from === "coach" ? C.orange : C.panel, color: m.from === "coach" ? "#fff" : C.text, border: m.from === "coach" ? "none" : `1px solid ${C.border}` }}>
                  <div className="text-sm">{m.text}</div>
                  <div className="text-[10px] mt-1 opacity-70">{m.time}</div>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="flex items-center gap-2 px-4 py-3 shrink-0" style={{ borderTop: `1px solid ${C.border}` }}>
            <input style={{ ...inputStyle, flex: 1 }} placeholder="Message..." value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} />
            <button onClick={send} className="rounded-full p-2.5 shrink-0" style={{ background: C.orange }}><Send size={18} style={{ color: "#fff" }} /></button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// COACH PROFILE — roster-wide statistics hub
// ============================================================

function CoachProfile({ state, setState, nav }) {
  const totalAthletes = state.athletes.length;
  const activePrograms = state.programs.length;
  const totalSessions = state.workoutLogs.length;
  const injuredCount = state.athletes.filter(a => a.injuries?.length > 0).length;
  const unassigned = state.athletes.filter(a => !a.program && !a.customProgram).length;
  const mostActive = [...state.athletes].sort((a, b) => (b.streak || 0) - (a.streak || 0))[0];
  const coach = state.coachProfile || { name: "Coach", avatar: "CO", photoUrl: null, accountabilityEnabled: true };
  const accountabilityOn = coach.accountabilityEnabled !== false;

  const setPhoto = (dataUrl) => setState(s => ({ ...s, coachProfile: { ...(s.coachProfile || {}), photoUrl: dataUrl } }));
  const toggleAccountability = () => setState(s => ({ ...s, coachProfile: { ...(s.coachProfile || {}), accountabilityEnabled: !accountabilityOn } }));

  // Today's checkins across all athletes
  const today = todayISO();
  const checkins = state.sessionCheckins || {};
  const todayCheckin = checkins[today];
  const confirmedToday = todayCheckin?.confirmed;

  return (
    <div className="pb-28">
      <TopBar title="Profile" onLogout={nav.logout} />
      <div className="px-5 pt-5">
        <div className="flex flex-col items-center mb-6">
          <EditableAvatar initials={coach.avatar} size={84} photoUrl={coach.photoUrl} onChange={setPhoto} />
          <div className="text-xl font-bold mt-3 text-center" style={{ fontFamily: "Inter", color: C.text }}>{coach.name}</div>
          <div className="text-sm" style={{ color: C.sub }}>{totalAthletes} athletes · {activePrograms} programs</div>
        </div>

        {/* Accountability Toggle */}
        <div className="rounded-xl p-4 mb-5" style={{ background: C.panel, border: `1px solid ${accountabilityOn ? C.orange : C.border}` }}>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold" style={{ color: C.text }}>Accountability Mode</div>
              <div className="text-xs mt-0.5" style={{ color: C.sub }}>
                {accountabilityOn ? "Athletes must check off sessions · Reminders active" : "Session check-offs disabled · No reminders"}
              </div>
            </div>
            <button onClick={toggleAccountability} className="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors"
              style={{ background: accountabilityOn ? C.orange : C.border }}>
              <span className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5"
                style={{ transform: accountabilityOn ? "translateX(22px)" : "translateX(2px)" }} />
            </button>
          </div>
        </div>

        {/* Checkin status — today's roster */}
        {accountabilityOn && (
          <div className="rounded-xl p-4 mb-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="text-xs uppercase tracking-wide font-semibold mb-3" style={{ color: C.sub }}>Today's Check-ins</div>
            {state.athletes.length === 0 ? (
              <div className="text-sm text-center py-3" style={{ color: C.faint }}>No athletes yet.</div>
            ) : (
              <div className="space-y-2">
                {state.athletes.map(a => {
                  const prog = a.customProgram || state.programs.find(p => p.id === a.program);
                  const hasSession = !!prog;
                  // In prototype, use the shared checkin for all athletes — in prod this would be per-athlete
                  const checked = confirmedToday && hasSession;
                  return (
                    <div key={a.id} className="flex items-center gap-3 rounded-lg p-2.5" style={{ background: C.bg }}>
                      <Avatar initials={a.avatar} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: C.text }}>{a.name}</div>
                        <div className="text-xs" style={{ color: C.sub }}>{hasSession ? prog.days[0]?.name || "Rest day" : "No program"}</div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        {!hasSession ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: C.border, color: C.faint }}>No Program</span>
                        ) : checked ? (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${C.olive}22`, color: C.olive }}>
                            <CheckCircle2 size={11} /> Done
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${C.amber}22`, color: C.amber }}>Pending</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>Roster Overview</div>
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <StatCard icon={Users} label="Athletes" value={totalAthletes} accent={C.orange} />
          <StatCard icon={ClipboardList} label="Programs" value={activePrograms} accent={C.blue} />
          <StatCard icon={Dumbbell} label="Sessions Logged" value={totalSessions} accent={C.olive} />
        </div>
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <StatCard icon={AlertCircle} label="Flagged Injuries" value={injuredCount} accent={C.red} />
          <StatCard icon={Target} label="Unassigned" value={unassigned} accent={C.amber} />
        </div>

        {mostActive && mostActive.streak > 0 && (
          <>
            <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>Top Streak</div>
            <button onClick={() => nav.go("coach-athlete-detail", mostActive.id)} className="w-full rounded-xl p-3.5 flex items-center gap-3 text-left mb-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <Avatar initials={mostActive.avatar} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate" style={{ color: C.text }}>{mostActive.name}</div>
                <div className="text-xs truncate" style={{ color: C.sub }}>{mostActive.sport}</div>
              </div>
              <div className="flex items-center gap-1 text-sm font-mono font-bold shrink-0" style={{ color: C.amber }}><Flame size={15} />{mostActive.streak}</div>
            </button>
          </>
        )}

        <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>More</div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <button onClick={() => nav.go("coach-athletes")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.orange}22` }}><Users size={18} style={{ color: C.orange }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>All Athletes</span>
          </button>
          <button onClick={() => nav.go("coach-programs")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.blue}22` }}><ClipboardList size={18} style={{ color: C.blue }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Programs</span>
          </button>
          <button onClick={() => nav.go("exercise-library")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.olive}22` }}><BookOpen size={18} style={{ color: C.olive }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Exercise Library</span>
          </button>
          <button onClick={() => nav.go("calendar")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.amber}22` }}><Calendar size={18} style={{ color: C.amber }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Calendar</span>
          </button>
        </div>

        <ChalkDivider label="Roster" />
        <div className="space-y-2">
          {state.athletes.map(a => (
            <button key={a.id} onClick={() => nav.go("coach-athlete-detail", a.id)} className="w-full rounded-lg p-3 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <Avatar initials={a.avatar} size={32} />
              <span className="text-sm flex-1 min-w-0 truncate" style={{ color: C.text }}>{a.name}</span>
              <span className="text-xs font-mono shrink-0" style={{ color: C.sub }}>{a.streak}d streak</span>
            </button>
          ))}
        </div>

        <Btn variant="danger" className="w-full mt-6" icon={LogOut} onClick={nav.logout}>Log Out</Btn>
      </div>
    </div>
  );
}

// ============================================================
// ATHLETE PORTAL
// ============================================================

function AthleteDashboard({ state, setState, nav }) {
  const myProgram = state.me.customProgram || state.programs.find(p => p.id === state.me.program);
  const todayDay = myProgram?.days[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const accountabilityOn = state.coachProfile?.accountabilityEnabled !== false;
  const today = todayISO();
  const checkins = state.sessionCheckins || {};
  const todayCheckin = checkins[today];
  const alreadyCheckedIn = todayCheckin?.confirmed;

  const confirmCheckin = () => {
    setState(s => ({
      ...s,
      sessionCheckins: {
        ...s.sessionCheckins,
        [today]: { confirmed: true, programDay: todayDay?.name || "Session", confirmedAt: new Date().toLocaleTimeString() }
      }
    }));
  };

  // Build reminder banners
  const reminders = [];
  if (myProgram) {
    const totalDays = myProgram.days?.length || 0;
    const logCount = (state.workoutLogs || []).length;

    // Session today — needs check-in
    if (accountabilityOn && todayDay && !alreadyCheckedIn) {
      reminders.push({ type: "session", icon: "💪", text: `You have a session today — ${todayDay.name}`, color: C.orange });
    }
    // Program starting (first log)
    if (logCount === 0 && myProgram) {
      reminders.push({ type: "start", icon: "🚀", text: `${myProgram.name} is ready to begin. Hit Start Workout to kick things off.`, color: C.blue });
    }
    // Program ending — last 2 sessions
    if (logCount >= totalDays * (myProgram.weeks || 4) - 2 && logCount > 0) {
      reminders.push({ type: "end", icon: "🏁", text: "You're in the final stretch of your program — finish strong!", color: C.amber });
    }
  }

  return (
    <div className="pb-28">
      <div className="px-5 pt-6 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base" style={{ color: C.sub }}>{greeting} 👋</div>
          <div className="text-3xl mt-0.5 truncate" style={{ fontFamily: "Inter", fontWeight: 800, color: C.text }}>{state.me.name.split(" ")[0]}</div>
        </div>
        <button onClick={nav.logout} className="flex items-center gap-1.5 rounded-full px-3 py-2 shrink-0" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <Flame size={14} style={{ color: C.amber }} />
          <span className="text-sm font-bold font-mono" style={{ color: C.text }}>{state.me.streak}</span>
          <span className="text-xs" style={{ color: C.sub }}>day streak</span>
        </button>
      </div>

      <div className="px-5 pt-4">
        {/* Reminder banners */}
        {reminders.length > 0 && (
          <div className="space-y-2.5 mb-5">
            {reminders.map((r, i) => (
              <div key={i} className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: `${r.color}18`, border: `1px solid ${r.color}55` }}>
                <span className="text-lg shrink-0">{r.icon}</span>
                <span className="text-sm" style={{ color: C.text }}>{r.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Session check-off — only when accountability is on */}
        {accountabilityOn && todayDay && (
          <div className="rounded-xl p-4 mb-5" style={{ background: alreadyCheckedIn ? `${C.olive}18` : `${C.orange}12`, border: `1px solid ${alreadyCheckedIn ? C.olive : C.orange}55` }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: alreadyCheckedIn ? C.olive : C.text }}>
                  {alreadyCheckedIn ? "✅ Session confirmed!" : "📋 Session check-in required"}
                </div>
                <div className="text-xs mt-0.5" style={{ color: C.sub }}>
                  {alreadyCheckedIn
                    ? `Checked in at ${todayCheckin.confirmedAt}`
                    : "Your coach requires you to confirm completed sessions."}
                </div>
              </div>
              {!alreadyCheckedIn && (
                <button onClick={confirmCheckin} className="rounded-full px-3 py-2 text-xs font-semibold shrink-0"
                  style={{ background: C.orange, color: "#fff" }}>
                  Confirm
                </button>
              )}
            </div>
          </div>
        )}
        {todayDay ? (
          <div className="relative w-full text-left rounded-3xl p-6 mb-6 overflow-hidden" style={{ background: `linear-gradient(135deg, ${C.gradFrom}, ${C.gradTo})` }}>
            <div className="absolute rounded-full" style={{ width: 200, height: 200, right: -60, top: -60, background: "#ffffff14" }} />
            <div className="text-xs font-semibold uppercase tracking-wider relative" style={{ color: "#ffffffb0" }}>Today's Focus</div>
            <div className="text-3xl mt-1.5 truncate relative" style={{ fontFamily: "Inter", fontWeight: 800, color: "#fff" }}>{todayDay.name}</div>
            <div className="text-sm mt-1 relative" style={{ color: "#ffffffcc" }}>{todayDay.exercises.length} exercises</div>
            <button onClick={() => nav.go("athlete-workout")} className="relative mt-5 inline-flex items-center gap-2 rounded-full px-5 py-3 font-semibold text-sm" style={{ background: "#fff", color: C.orange }}>
              <Play size={15} fill={C.orange} /> Start Workout
            </button>
          </div>
        ) : (
          <div className="rounded-3xl p-6 mb-6 text-center" style={{ background: C.panel, border: `1px dashed ${C.border}` }}>
            {state.me.selfGuided ? (
              <>
                <div className="text-sm font-semibold mb-1" style={{ color: C.text }}>Setting up your program</div>
                <p className="text-xs" style={{ color: C.sub }}>Your AI-generated program is being built from your intake. It'll appear here shortly.</p>
              </>
            ) : (
              <p className="text-sm" style={{ color: C.sub }}>Waiting on your coach to assign a program.</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2.5 mb-6">
          <StatCard icon={Dumbbell} label="Workouts" value={state.workoutLogs.length} accent={C.orange} />
          <StatCard icon={Salad} label="Calories" value="0" sub="kcal" accent={C.olive} />
          <StatCard icon={Zap} label="Protein" value="0" sub="g" accent={C.amber} />
        </div>

        {/* Accountability — weekly completion tracker */}
        {(() => {
          const today = new Date();
          const dayOfWeek = today.getDay(); // 0=Sun
          const weekDays = Array.from({length: 7}, (_, i) => {
            const d = new Date(today);
            d.setDate(today.getDate() - dayOfWeek + i);
            return d;
          });
          const loggedDates = new Set(state.workoutLogs.map(l => l.date));
          const dayLabels = ["S","M","T","W","T","F","S"];
          const completed = weekDays.filter(d => loggedDates.has(d.toISOString().slice(0,10))).length;
          const target = state.me.daysPerWeek || 4;
          return (
            <div className="rounded-2xl p-4 mb-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold" style={{ color: C.text }}>This Week</div>
                <div className="text-xs font-mono" style={{ color: completed >= target ? C.olive : C.sub }}>{completed}/{target} sessions</div>
              </div>
              <div className="flex gap-1.5 justify-between">
                {weekDays.map((d, i) => {
                  const iso = d.toISOString().slice(0,10);
                  const done = loggedDates.has(iso);
                  const isToday = i === dayOfWeek;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-[9px]" style={{ color: isToday ? C.orange : C.faint }}>{dayLabels[i]}</div>
                      <div className="w-full aspect-square rounded-lg flex items-center justify-center"
                        style={{ background: done ? C.olive : isToday ? `${C.orange}22` : C.border, border: isToday ? `1px solid ${C.orange}55` : "none" }}>
                        {done && <CheckCircle2 size={12} style={{ color: "#fff" }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
              {completed >= target && (
                <div className="mt-3 text-center text-xs font-semibold" style={{ color: C.olive }}>🔥 Weekly goal hit! Keep going.</div>
              )}
            </div>
          );
        })()}

        <div className="text-lg mb-3" style={{ fontFamily: "Inter", fontWeight: 800, color: C.text }}>Quick Access</div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button onClick={() => nav.go("calendar")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.orange}22` }}><Calendar size={18} style={{ color: C.orange }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Calendar</span>
          </button>
          <button onClick={() => nav.go("nutrition")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.olive}22` }}><Salad size={18} style={{ color: C.olive }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Nutrition</span>
          </button>
          <button onClick={() => nav.go("athlete-progress")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.blue}22` }}><TrendingUp size={18} style={{ color: C.blue }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Progress</span>
          </button>
          <button onClick={() => nav.go("exercise-library")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.amber}22` }}><BookOpen size={18} style={{ color: C.amber }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Exercise Library</span>
          </button>
        </div>

        <ChalkDivider label="Recent Sessions" />
        <div className="space-y-2.5">
          {state.workoutLogs.map(l => (
            <div key={l.id} className="rounded-xl p-3.5 flex items-center gap-3" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <div className="rounded-lg p-2 shrink-0" style={{ background: C.border }}><CheckCircle2 size={18} style={{ color: C.olive }} /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: C.text }}>{l.programDay}</div>
                <div className="text-xs" style={{ color: C.sub }}>{formatLogDate(l.date)} · {l.duration} min</div>
              </div>
            </div>

          ))}
        </div>
      </div>
    </div>
  );
}

function AthleteProgram({ state, setState, nav }) {
  const myProgram = state.me.customProgram || state.programs.find(p => p.id === state.me.program);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [swapTarget, setSwapTarget] = useState(null);
  const exById = id => state.exercises.find(e => e.id === id);

  if (!myProgram) {
    return (
      <div className="pb-28">
        <TopBar title="My Program" onLogout={nav.logout} />
        <div className="px-5 pt-10 text-center">
          {state.me.selfGuided
            ? <><div className="text-sm font-semibold mb-1" style={{ color: C.text }}>Your program is being built</div><p className="text-xs" style={{ color: C.sub }}>Your AI-generated plan will appear here once it's ready.</p></>
            : <p className="text-sm" style={{ color: C.sub }}>Waiting on your coach to assign a program.</p>
          }
        </div>
      </div>
    );
  }

  const day = myProgram.days[activeDayIdx];
  // Order is set once at generation/build time (phase sequence) and persists here —
  // NOT re-sorted on every render — so a manual reorder below actually sticks.
  const sortedExercises = day ? day.exercises : [];

  const swapExerciseInMyProgram = (dayId, xId, newExercise) => {
    const isCustom = !!state.me.customProgram;
    const updateDays = (prog) => ({
      ...prog,
      days: prog.days.map(d => d.id === dayId
        ? { ...d, exercises: d.exercises.map(x => x.id === xId ? { ...x, exerciseId: newExercise.id, phase: newExercise.phase } : x) }
        : d)
    });
    if (isCustom) {
      const updated = updateDays(state.me.customProgram);
      setState(s => ({ ...s, me: { ...s.me, customProgram: updated } }));
    } else {
      const updated = updateDays(myProgram);
      setState(s => ({ ...s, programs: s.programs.map(p => p.id === myProgram.id ? updated : p) }));
      if (state.me.id) updateProgramRow(myProgram.id, updated.days, state);
    }
  };

  const moveExercise = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= sortedExercises.length) return;
    const isCustom = !!state.me.customProgram;
    const updateDays = (prog) => ({
      ...prog,
      days: prog.days.map((d, i) => {
        if (i !== activeDayIdx) return d;
        const next = [...d.exercises];
        [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
        return { ...d, exercises: next };
      })
    });
    if (isCustom) {
      const updated = updateDays(state.me.customProgram);
      setState(s => ({ ...s, me: { ...s.me, customProgram: updated } }));
    } else {
      const updated = updateDays(myProgram);
      setState(s => ({ ...s, programs: s.programs.map(p => p.id === myProgram.id ? updated : p) }));
      if (state.me.id) updateProgramRow(myProgram.id, updated.days, state);
    }
  };

  return (
    <div className="pb-28">
      <div className="px-5 pt-6 pb-2">
        <div className="text-2xl" style={{ fontFamily: "Inter", fontWeight: 800, color: C.text }}>My Program</div>
        <div className="text-sm mt-0.5" style={{ color: C.sub }}>AI-generated for your goals</div>
      </div>

      <div className="px-5 pt-4">
        <div className="relative rounded-3xl p-6 mb-5 overflow-hidden" style={{ background: `linear-gradient(135deg, ${C.gradFrom}, ${C.gradTo})` }}>
          <div className="absolute rounded-full" style={{ width: 180, height: 180, right: -50, top: -50, background: "#ffffff14" }} />
          <div className="text-xs font-semibold uppercase tracking-wider relative" style={{ color: "#ffffffb0" }}>Active Program</div>
          <div className="text-2xl mt-1.5 relative" style={{ fontFamily: "Inter", fontWeight: 800, color: "#fff" }}>{myProgram.name}</div>
          <div className="text-sm mt-2 relative leading-relaxed" style={{ color: "#ffffffd0" }}>
            {myProgram.weeks}-week program with {myProgram.days.length} training days per cycle, built around {state.me.goals?.join(" + ") || "your goals"}.
          </div>
          <div className="flex items-center gap-4 mt-4 relative text-sm" style={{ color: "#ffffffcc" }}>
            <span className="flex items-center gap-1.5"><Clock size={14} /> 60min sessions</span>
            <span className="flex items-center gap-1.5"><RefreshCw size={14} /> {myProgram.days.length}x per week</span>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {myProgram.days.map((d, i) => (
            <button key={d.id} onClick={() => setActiveDayIdx(i)} className="shrink-0 rounded-2xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap"
              style={{ background: activeDayIdx === i ? C.orange : C.panel, color: activeDayIdx === i ? "#fff" : C.sub, border: `1px solid ${activeDayIdx === i ? C.orange : C.border}` }}>
              {d.name.split("—")[0].trim()}
            </button>
          ))}
        </div>

        {day && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xl" style={{ fontFamily: "Inter", fontWeight: 800, color: C.text }}>{day.name}</div>
                <div className="text-sm mt-0.5" style={{ color: C.orange }}>{sortedExercises.length} exercises</div>
              </div>
              <button onClick={() => nav.go("athlete-workout")} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 font-semibold text-sm shrink-0" style={{ background: C.orange, color: "#fff" }}>
                <Play size={14} fill="#fff" /> Start
              </button>
            </div>

            <div className="space-y-2">
              {sortedExercises.map((x, i) => {
                const ex = exById(x.exerciseId);
                const phaseLabel = PHASES.find(p => p.key === x.phase)?.short;
                return (
                  <div key={x.id} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div className="rounded-xl w-11 h-11 flex items-center justify-center shrink-0 overflow-hidden" style={{ background: `linear-gradient(135deg, ${C.gradFrom}, ${C.gradTo})` }}>
                      {exerciseImage(ex?.name) ? <img src={exerciseImage(ex.name)} alt={ex.name} className="w-full h-full object-cover" /> : <span className="text-sm font-bold text-white">{i + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: C.text }}>{ex?.name}</div>
                      <div className="text-xs font-mono mt-0.5" style={{ color: C.sub }}>{phaseLabel} · {x.sets}×{x.reps} · RPE {x.rpe}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setSwapTarget({ dayId: day.id, x })} className="p-1.5" aria-label="Swap exercise">
                        <RotateCcw size={15} style={{ color: C.blue }} />
                      </button>
                      <div className="flex flex-col">
                        <button onClick={() => moveExercise(i, i - 1)} disabled={i === 0} className="p-1 disabled:opacity-25" aria-label="Move up">
                          <ChevronUp size={16} style={{ color: C.sub }} />
                        </button>
                        <button onClick={() => moveExercise(i, i + 1)} disabled={i === sortedExercises.length - 1} className="p-1 disabled:opacity-25" aria-label="Move down">
                          <ChevronDown size={16} style={{ color: C.sub }} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <ExerciseSwapModal open={!!swapTarget} onClose={() => setSwapTarget(null)} currentExercise={swapTarget?.x} exercises={state.exercises}
        onSwap={(newEx) => swapExerciseInMyProgram(swapTarget.dayId, swapTarget.x.id, newEx)} />
    </div>
  );
}

function RestTimer({ seconds, onDone }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) { onDone?.(); return; }
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const pct = Math.max(0, left / seconds);
  return (
    <div className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.sub }}>Rest Timer</span>
        <span className="font-mono font-bold" style={{ color: C.orange }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
      </div>
      <div className="relative h-6 rounded-full overflow-hidden" style={{ background: C.bg }}>
        <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${(1 - pct) * 100}%`, background: `linear-gradient(90deg, ${C.gradFrom}, ${C.gradTo})` }} />
        {[0.2, 0.4, 0.6, 0.8].map(p => <div key={p} className="absolute top-0 bottom-0 w-0.5" style={{ left: `${p * 100}%`, background: "#00000066" }} />)}
      </div>
    </div>
  );
}

function Workout({ state, setState, nav }) {
  const myProgram = state.me.customProgram || state.programs.find(p => p.id === state.me.program);
  const day = myProgram?.days[0];
  const exById = id => state.exercises.find(e => e.id === id);
  const sortedExercises = useMemo(() => day ? day.exercises : [], [day]);

  const [exIdx, setExIdx] = useState(0);
  const [setChecks, setSetChecks] = useState({});
  const [resting, setResting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [mood, setMood] = useState(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swappedMap, setSwappedMap] = useState({});
  const [showGenerator, setShowGenerator] = useState(false);

  if (!day) return (
    <div className="pb-28">
      <TopBar title="Workout" onLogout={nav.logout} />
      <div className="px-5 pt-10 text-center">
        {state.me.selfGuided
          ? (
            <>
              <div className="text-sm font-semibold mb-1" style={{ color: C.text }}>No program yet</div>
              <p className="text-xs mb-5" style={{ color: C.sub }}>Generate a fully comprehensive program based on your sign-up screening.</p>
              <Btn icon={Sparkles} onClick={() => setShowGenerator(true)}>Generate Program</Btn>
            </>
          )
          : <p className="text-sm" style={{ color: C.sub }}>Waiting on your coach to assign a program.</p>
        }
      </div>
      {showGenerator && (
        <AIProgramGenerator
          intake={state.me.intake || {}}
          onClose={() => setShowGenerator(false)}
          onGenerated={async (result) => {
            const weeks = result.weeks || 6;
            const sport = state.me.intake?.["🥊 Sport / Focus"] || "General Fitness";
            const dbId = state.me.id ? await createProgramRow(state.me.id, result.programName, weeks, sport, result.days) : null;
            setState(s => applyGeneratedProgram(result, s, state.me.intake, dbId));
            setShowGenerator(false);
          }}
        />
      )}
    </div>
  );

  const x = sortedExercises[exIdx];
  const ex = x && exById(swappedMap[x.id] || x.exerciseId);
  const totalSets = x?.sets || 0;
  const doneSets = setChecks[x?.id]?.length || 0;
  const phaseLabel = PHASES.find(p => p.key === x?.phase)?.label;

  const toggleSet = (setNum) => {
    setSetChecks(sc => {
      const cur = sc[x.id] || [];
      const next = cur.includes(setNum) ? cur.filter(n => n !== setNum) : [...cur, setNum];
      return { ...sc, [x.id]: next };
    });
    if (!(setChecks[x.id] || []).includes(setNum)) { setResting(true); setTimeout(() => setResting(false), 100); }
  };

  const finishWorkout = () => {
    setState(s => ({ ...s, workoutLogs: [{ id: "l" + Date.now(), date: todayISO(), programDay: day.name, duration: 52, mood }, ...s.workoutLogs] }));
    if (state.me.id) supabase.from("workout_logs").insert({ user_id: state.me.id, date: todayISO(), program_day: day.name, duration: 52, mood });
    setFinished(true);
  };

  if (finished) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: C.bg }}>
        <Trophy size={48} style={{ color: C.orange }} />
        <h2 className="text-2xl font-bold mt-4 text-center" style={{ fontFamily: "Inter", color: C.text }}>SESSION LOGGED</h2>
        <p className="text-sm mt-1 text-center" style={{ color: C.sub }}>{day.name} complete. Nice work.</p>
        <Btn className="mt-8" onClick={() => nav.go("athlete-dashboard")}>Back to Dashboard</Btn>
      </div>
    );
  }

  return (
    <div className="pb-36">
      <TopBar title={day.name} right={<span className="text-xs font-mono shrink-0" style={{ color: C.sub }}>{exIdx + 1}/{sortedExercises.length}</span>} />
      <div className="px-5 pt-5">
        <div className="rounded-2xl overflow-hidden mb-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          {exerciseImage(ex?.name)
            ? <img src={exerciseImage(ex.name)} alt={ex.name} className="w-full h-44 object-cover" />
            : (
              <div className="w-full h-44 flex flex-col items-center justify-center gap-2 relative overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${C.steel}99, ${C.bg})` }}>
                <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 70% 30%, ${C.orange}22, transparent 60%)` }} />
                <Dumbbell size={36} style={{ color: `${C.orange}aa` }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: `${C.orange}99` }}>{phaseLabel}</span>
              </div>
            )
          }
          <div className="p-5">
          <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: C.orange }}>{phaseLabel}</div>
          <div className="text-2xl font-bold mt-1" style={{ fontFamily: "Inter", color: C.text }}>{ex?.name}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 font-mono text-sm" style={{ color: C.orange }}>
            <span>{x.sets} sets</span><span>{x.reps} reps</span><span>RPE {x.rpe}</span><span>rest {x.rest}</span>
          </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 mb-5 overflow-x-auto">
          <PlateBadge value={doneSets} label="Done" accent={C.olive} />
          <PlateBadge value={totalSets} label="Target" />
          <PlateBadge value={x.rpe} label="Target RPE" accent={C.blue} />
        </div>

        <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.sub }}>Sets</div>
        <div className="space-y-2 mb-5">
          {Array.from({ length: totalSets }).map((_, i) => {
            const checked = (setChecks[x.id] || []).includes(i);
            return (
              <button key={i} onClick={() => toggleSet(i)} className="w-full flex items-center gap-3 rounded-lg p-3" style={{ background: checked ? `${C.olive}18` : C.panel, border: `1px solid ${checked ? C.olive : C.border}` }}>
                {checked ? <CheckCircle2 size={20} style={{ color: C.olive }} /> : <Circle size={20} style={{ color: C.faint }} />}
                <span className="text-sm font-medium" style={{ color: C.text }}>Set {i + 1}</span>
                <span className="ml-auto font-mono text-sm shrink-0" style={{ color: C.sub }}>{x.reps} reps · RPE {x.rpe}</span>
              </button>
            );
          })}
        </div>

        {resting && <RestTimer seconds={5} onDone={() => setResting(false)} />}

        <ChalkDivider />
        <Btn variant="ghost" icon={RotateCcw} onClick={() => setSwapOpen(true)}>Swap This Exercise</Btn>
      </div>

      <div className="fixed bottom-16 left-0 right-0 px-5 py-4 flex gap-3" style={{ background: `${C.bg}ee`, backdropFilter: "blur(8px)", borderTop: `1px solid ${C.border}` }}>
        {exIdx > 0 && <Btn variant="secondary" onClick={() => setExIdx(i => i - 1)} icon={ChevronLeft}>Back</Btn>}
        {exIdx < sortedExercises.length - 1
          ? <Btn className="flex-1" onClick={() => setExIdx(i => i + 1)} icon={ChevronRight}>Next Exercise</Btn>
          : <Btn className="flex-1" onClick={() => setMood("ask")}>Finish Workout</Btn>}
      </div>

      <ExerciseSwapModal open={swapOpen} onClose={() => setSwapOpen(false)} currentExercise={{ exerciseId: ex?.id }} exercises={state.exercises}
        onSwap={(newEx) => setSwappedMap(m => ({ ...m, [x.id]: newEx.id }))} reasonPreset="" />

      <Modal open={mood === "ask"} onClose={() => setMood(null)} title="How'd that feel?">
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {[["tough", "😤", "Tough"], ["good", "💪", "Good"], ["strong", "🔥", "Strong"]].map(([key, emoji, label]) => (
            <button key={key} onClick={() => setMood(key)} className="rounded-xl p-4 text-center" style={{ background: mood === key ? `${C.orange}18` : C.bg, border: `1px solid ${mood === key ? C.orange : C.border}` }}>
              <div className="text-2xl">{emoji}</div>
              <div className="text-xs mt-1.5" style={{ color: C.text }}>{label}</div>
            </button>
          ))}
        </div>
        <Btn className="w-full" disabled={!mood || mood === "ask"} onClick={finishWorkout}>Log Session</Btn>
      </Modal>
    </div>
  );
}

function AthleteProgress({ state, setState, nav }) {
  const [logOpen, setLogOpen] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [unit, setUnit] = useState("lb");
  const data = state.progress;
  const display = kg => unit === "lb" ? kgToLb(kg) : kg;

  const logEntry = () => {
    if (!weightInput) return;
    const kg = unit === "lb" ? lbToKg(parseFloat(weightInput)) : parseFloat(weightInput);
    setState(s => ({ ...s, progress: [...s.progress, { date: "Today", weightKg: kg, bodyFat: null }] }));
    if (state.me.id) supabase.from("progress_entries").insert({ user_id: state.me.id, weight_kg: kg, body_fat: null });
    setWeightInput(""); setLogOpen(false);
  };

  if (data.length === 0) {
    return (
      <div className="pb-28">
        <TopBar title="Progress" onLogout={nav.logout} right={<button onClick={() => setLogOpen(true)}><Plus size={20} style={{ color: C.orange }} /></button>} />
        <div className="px-5 pt-10 text-center">
          <div className="text-sm font-semibold mb-1" style={{ color: C.text }}>No entries yet</div>
          <p className="text-xs mb-5" style={{ color: C.sub }}>Log your weight to start tracking progress over time.</p>
          <Btn icon={Plus} onClick={() => setLogOpen(true)}>Log Entry</Btn>
        </div>
        <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Log Weight">
          <Field label={`Weight (${unit})`}>
            <input type="number" style={inputStyle} value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder="0" />
          </Field>
          <Btn className="w-full mt-2" onClick={logEntry}>Save Entry</Btn>
        </Modal>
      </div>
    );
  }

  const maxW = Math.max(...data.map(d => d.weightKg));
  const minW = Math.min(...data.map(d => d.weightKg));

  return (
    <div className="pb-28">
      <TopBar title="Progress" onLogout={nav.logout} right={<button onClick={() => setLogOpen(true)}><Plus size={20} style={{ color: C.orange }} /></button>} />
      <div className="px-5 pt-5">
        <div className="flex justify-end mb-3"><UnitToggle value={unit} options={["lb", "kg"]} onChange={setUnit} /></div>
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          <StatCard icon={TrendingUp} label="Current Weight" value={display(data[data.length - 1].weightKg)} sub={unit} />
          <StatCard icon={Activity} label="Body Fat" value={`${data[data.length - 1].bodyFat ?? "—"}%`} accent={C.blue} />
        </div>

        <div className="rounded-xl p-4 mb-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <div className="text-xs uppercase tracking-wide font-semibold mb-4" style={{ color: C.sub }}>Weight Trend</div>
          <div className="flex items-end gap-2 h-32">
            {data.map((d, i) => {
              const h = ((d.weightKg - minW + 1) / (maxW - minW + 2)) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full rounded-t-md transition-all" style={{ height: `${h}%`, background: i === data.length - 1 ? C.orange : C.steel }} />
                  <span className="text-[9px]" style={{ color: C.faint }}>{d.date.split(" ")[1] || d.date}</span>
                </div>
              );
            })}
          </div>
        </div>

        <ChalkDivider label="Log History" />
        <div className="space-y-2">
          {[...data].reverse().map((d, i) => (
            <div key={i} className="rounded-lg p-3 flex justify-between items-center" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <span className="text-sm" style={{ color: C.text }}>{d.date}</span>
              <span className="font-mono text-sm" style={{ color: C.sub }}>{display(d.weightKg)} {unit}{d.bodyFat ? ` · ${d.bodyFat}%` : ""}</span>
            </div>
          ))}
        </div>
      </div>

      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Log Body Metrics">
        <div className="flex justify-end mb-3"><UnitToggle value={unit} options={["lb", "kg"]} onChange={setUnit} /></div>
        <Field label={`Weight (${unit})`}><input style={inputStyle} type="number" value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder={unit === "lb" ? "175" : "79"} /></Field>
        <Btn className="w-full" onClick={logEntry}>Save Entry</Btn>
      </Modal>
    </div>
  );
}

// Combined messages page: tabs for Coach chat and AI Assistant
function AthleteMessages({ state, setState, nav }) {
  const [tab, setTab] = useState("ai");
  const myId = state.me.id;
  const coachThread = state.messages[myId] || [];
  const [draft, setDraft] = useState("");
  const [aiThread, setAiThread] = useState(state.aiThread || AI_SUGGESTED);
  const [aiLoading, setAiLoading] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [coachThread.length, aiThread.length, tab]);

  const sendCoach = () => {
    if (!draft.trim()) return;
    setState(s => ({ ...s, messages: { ...s.messages, [myId]: [...(s.messages[myId] || []), { id: "m" + Date.now(), from: "athlete", text: draft, time: "Now" }] } }));
    setDraft("");
  };

  const sendAI = async () => {
    if (!draft.trim()) return;
    const userMsg = { id: "m" + Date.now(), from: "athlete", text: draft, time: "Now" };
    const nextThread = [...aiThread, userMsg];
    setAiThread(nextThread);
    setDraft(""); setAiLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1000,
          messages: [
            { role: "user", content: `You are a knowledgeable, encouraging strength & conditioning AI assistant inside a coaching app. Keep responses concise (2-4 sentences) and practical. The athlete trains for ${state.me.sport}. Athlete asks: ${userMsg.text}` }
          ],
        })
      });
      const data = await response.json();
      const textBlock = (data.content || []).find(b => b.type === "text");
      const replyText = textBlock?.text || "Sorry, I couldn't generate a response just now.";
      setAiThread(t => [...t, { id: "m" + Date.now(), from: "ai", text: replyText, time: "Now" }]);
    } catch (err) {
      setAiThread(t => [...t, { id: "m" + Date.now(), from: "ai", text: "Something went wrong reaching the AI assistant — try again in a moment.", time: "Now" }]);
    } finally {
      setAiLoading(false);
    }
  };

  const thread = tab === "coach" ? coachThread : aiThread;

  return (
    <div className="flex flex-col h-screen pb-16">
      <TopBar title="Messages" onLogout={nav.logout} />
      <div className="flex gap-2 px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        <Pill active={tab === "coach"} onClick={() => setTab("coach")}>Coach Chat</Pill>
        <Pill active={tab === "ai"} onClick={() => setTab("ai")}><span className="flex items-center gap-1"><Bot size={12} />AI Assistant</span></Pill>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {thread.length === 0 && <div className="text-center text-sm mt-10" style={{ color: C.faint }}>{tab === "coach" ? "Message your coach to get started." : "Ask me anything about training."}</div>}
        {thread.map(m => (
          <div key={m.id} className={`flex ${m.from === "athlete" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%] rounded-2xl px-3.5 py-2.5" style={{
              background: m.from === "athlete" ? C.orange : (m.from === "ai" ? `${C.steel}55` : C.panel),
              color: m.from === "athlete" ? "#fff" : C.text,
              border: m.from === "athlete" ? "none" : `1px solid ${C.border}`
            }}>
              {m.from === "ai" && <div className="flex items-center gap-1 text-[10px] font-semibold mb-1" style={{ color: C.blue }}><Bot size={11} /> AI Assistant</div>}
              <div className="text-sm whitespace-pre-wrap">{m.text}</div>
              {m.time && <div className="text-[10px] mt-1 opacity-70">{m.time}</div>}
            </div>
          </div>
        ))}
        {aiLoading && tab === "ai" && (
          <div className="flex justify-start"><div className="rounded-2xl px-3.5 py-2.5" style={{ background: `${C.steel}55`, border: `1px solid ${C.border}` }}><Loader2 size={14} className="animate-spin" style={{ color: C.blue }} /></div></div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 px-4 py-3 shrink-0" style={{ borderTop: `1px solid ${C.border}` }}>
        {tab === "coach" && <button style={{ color: C.sub }} className="shrink-0"><ImageIcon size={20} /></button>}
        <input style={{ ...inputStyle, flex: 1 }} placeholder={tab === "coach" ? "Message your coach..." : "Ask the AI assistant..."} value={draft}
          onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && (tab === "coach" ? sendCoach() : sendAI())} />
        <button onClick={tab === "coach" ? sendCoach : sendAI} className="rounded-full p-2.5 shrink-0" style={{ background: C.orange }}><Send size={18} style={{ color: "#fff" }} /></button>
      </div>
    </div>
  );
}

function AthleteProfile({ state, setState, nav }) {
  const m = state.me;
  const { ft, inch } = cmToFtIn(m.heightCm);
  const latestProgress = state.progress[state.progress.length - 1];
  const firstProgress = state.progress[0];
  const weightChange = latestProgress && firstProgress ? (latestProgress.weightKg - firstProgress.weightKg) : 0;
  const totalMinutes = state.workoutLogs.reduce((sum, l) => sum + (l.duration || 0), 0);

  const setPhoto = (dataUrl) => setState(s => ({ ...s, me: { ...s.me, photoUrl: dataUrl } }));

  return (
    <div className="pb-28">
      <TopBar title="Profile" onLogout={nav.logout} />
      <div className="px-5 pt-5">
        <div className="flex flex-col items-center mb-6">
          <EditableAvatar initials={m.avatar} size={84} photoUrl={m.photoUrl} onChange={setPhoto} />
          <div className="text-xl font-bold mt-3 text-center" style={{ fontFamily: "Inter", color: C.text }}>{m.name}</div>
          <div className="text-sm" style={{ color: C.sub }}>{m.sport} · {m.sex === "male" ? "Male" : "Female"}</div>
          {m.goals?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5 justify-center">
              {m.goals.map(g => <span key={g} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${C.orange}22`, color: C.orange }}>{g}</span>)}
            </div>
          )}
        </div>

        <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>Training Stats</div>
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <StatCard icon={Flame} label="Streak" value={m.streak} sub="days" accent={C.amber} />
          <StatCard icon={Dumbbell} label="Logged" value={state.workoutLogs.length} sub="sessions" accent={C.blue} />
          <StatCard icon={Award} label="PRs" value={0} accent={C.olive} />
        </div>
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <StatCard icon={Clock} label="Time Trained" value={totalMinutes} sub="minutes" accent={C.orange} />
          <StatCard icon={TrendingUp} label="Weight Change" value={`${weightChange > 0 ? "+" : ""}${kgToLb(weightChange).toFixed(1)}`} sub="lb" accent={weightChange < 0 ? C.olive : C.amber} />
        </div>

        <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>Body Metrics</div>
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <StatCard icon={Ruler} label="📏 Height" value={`${ft}'${inch}"`} accent={C.amber} />
          <StatCard icon={Scale} label="⚖️ Weight" value={`${kgToLb(m.weightKg)} lb`} accent={C.amber} />
        </div>

        {m.injuries?.length > 0 && (
          <>
            <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>Injury Flags</div>
            <div className="rounded-lg p-3 mb-5 flex items-start gap-2" style={{ background: `${C.red}18`, border: `1px solid ${C.red}55` }}>
              <AlertCircle size={15} style={{ color: C.red }} className="mt-0.5 shrink-0" />
              <div className="text-xs" style={{ color: C.red }}>{m.injuries.join(", ")}</div>
            </div>
          </>
        )}

        <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>More</div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <button onClick={() => nav.go("athlete-progress")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.blue}22` }}><TrendingUp size={18} style={{ color: C.blue }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Full Progress</span>
          </button>
          <button onClick={() => nav.go("nutrition")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.olive}22` }}><Salad size={18} style={{ color: C.olive }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Nutrition</span>
          </button>
          <button onClick={() => nav.go("exercise-library")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.orange}22` }}><BookOpen size={18} style={{ color: C.orange }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Exercise Library</span>
          </button>
          <button onClick={() => nav.go("calendar")} className="rounded-2xl p-4 flex items-center gap-3 text-left" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${C.amber}22` }}><Calendar size={18} style={{ color: C.amber }} /></div>
            <span className="text-sm font-medium" style={{ color: C.text }}>Calendar</span>
          </button>
        </div>

        <ChalkDivider label="Recent Sessions" />
        <div className="space-y-2">
          {state.workoutLogs.map(l => (
            <div key={l.id} className="rounded-lg p-3 flex justify-between gap-2" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <span className="text-sm truncate" style={{ color: C.text }}>{l.programDay}</span>
              <span className="text-xs font-mono shrink-0" style={{ color: C.sub }}>{formatLogDate(l.date)}</span>
            </div>
          ))}
        </div>
        <Btn variant="danger" className="w-full mt-6" icon={LogOut} onClick={nav.logout}>Log Out</Btn>
      </div>
    </div>
  );
}

// ============================================================
// SHARED PAGES
// ============================================================

function ExerciseDetailModal({ open, onClose, exercise }) {
  if (!exercise) return null;
  const img = exerciseImage(exercise.name);
  const phaseLabel = PHASES.find(p => p.key === exercise.phase)?.label || exercise.phase;
  const phaseColors = {
    warmup_general: "#5B8DEF", warmup_specific: "#9CAA7A", compound: "#3B6FED",
    explosive: "#F0A93C", hypertrophy: "#7FA8C9", lactic: "#FF6B6B", aerobic: "#34C77B", cooldown: "#9CAA7A"
  };
  const accent = phaseColors[exercise.phase] || C.orange;
  return (
    <Modal open={open} onClose={onClose} title="" wide>
      <div className="rounded-xl overflow-hidden mb-4 -mx-5 -mt-5" style={{ height: 220, background: `linear-gradient(135deg, ${accent}33, ${C.bg})` }}>
        {img
          ? <img src={img} alt={exercise.name} className="w-full h-full object-cover" />
          : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <Dumbbell size={40} style={{ color: accent }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>{phaseLabel}</span>
            </div>
          )}
      </div>
      <div className="mb-1 text-xl font-bold" style={{ fontFamily: "Inter", color: C.text }}>{exercise.name}</div>
      <div className="flex flex-wrap gap-2 mt-2 mb-4">
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: `${accent}22`, color: accent }}>{phaseLabel}</span>
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: `${C.border}`, color: C.sub }}>{exercise.pattern}</span>
        {exercise.injuryTag && <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: `${C.red}22`, color: C.red }}>⚠️ {exercise.injuryTag} care</span>}
      </div>
    </Modal>
  );
}

function AddExerciseModal({ open, onClose, onAdd }) {
  const [name, setName] = useState("");
  const [phase, setPhase] = useState(PHASES[0].key);
  const [pattern, setPattern] = useState(PATTERNS[0]);

  const reset = () => { setName(""); setPhase(PHASES[0].key); setPattern(PATTERNS[0]); };

  const submit = () => {
    if (!name.trim()) return;
    onAdd({ id: "ecustom" + Date.now(), name: name.trim(), phase, pattern, hasMedia: false });
    reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Add Exercise" wide>
      <Field label="Exercise name">
        <input style={inputStyle} placeholder="e.g. Trap Bar Jump" value={name} onChange={e => setName(e.target.value)} />
      </Field>
      <Field label="Phase">
        <div className="grid grid-cols-2 gap-2">
          {PHASES.map(p => (
            <button key={p.key} onClick={() => setPhase(p.key)} className="rounded-lg px-3 py-2.5 text-sm text-left"
              style={{ background: phase === p.key ? `${C.orange}18` : C.bg, border: `1px solid ${phase === p.key ? C.orange : C.border}`, color: phase === p.key ? C.orange : C.text }}>
              {p.short}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Movement pattern">
        <div className="grid grid-cols-2 gap-2">
          {PATTERNS.map(p => (
            <button key={p} onClick={() => setPattern(p)} className="rounded-lg px-3 py-2.5 text-xs text-left"
              style={{ background: pattern === p ? `${C.orange}18` : C.bg, border: `1px solid ${pattern === p ? C.orange : C.border}`, color: pattern === p ? C.orange : C.text }}>
              {p}
            </button>
          ))}
        </div>
      </Field>
      <Btn className="w-full" disabled={!name.trim()} onClick={submit} icon={Plus}>Add to Library</Btn>
    </Modal>
  );
}

function ExerciseLibraryPage({ state, setState, nav, isCoach }) {
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailExercise, setDetailExercise] = useState(null);

  const addExercise = (ex) => setState(s => ({ ...s, exercises: [...s.exercises, ex] }));
  const deleteExercise = (id) => {
    setState(s => ({ ...s, exercises: s.exercises.filter(e => e.id !== id) }));
    setDeleteTarget(null);
  };

  const searchFiltered = state.exercises.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  // phase accent colors matching ExerciseDetailModal
  const phaseAccents = {
    warmup_general: C.blue, warmup_specific: C.olive, compound: C.orange,
    explosive: C.amber, hypertrophy: C.blue, lactic: "#FF6B6B", aerobic: C.olive, cooldown: C.olive
  };

  const ExerciseCard = ({ ex }) => (
    <div key={ex.id} className="relative rounded-xl overflow-hidden cursor-pointer active:opacity-80"
      style={{ background: C.panel, border: `1px solid ${C.border}` }}
      onClick={() => setDetailExercise(ex)}>
      {isCoach && (
        <button onClick={e => { e.stopPropagation(); setDeleteTarget(ex); }}
          className="absolute top-2 right-2 z-10 rounded-full p-1.5" style={{ background: "#000000aa" }}>
          <Trash2 size={13} style={{ color: "#fff" }} />
        </button>
      )}
      <div className="h-24 flex items-center justify-center overflow-hidden" style={{ background: C.border }}>
        {exerciseImage(ex.name)
          ? <img src={exerciseImage(ex.name)} alt={ex.name} className="w-full h-full object-cover" />
          : (
            <div className="w-full h-full flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${phaseAccents[ex.phase] || C.steel}22, ${C.bg})` }}>
              <Dumbbell size={24} style={{ color: phaseAccents[ex.phase] || C.faint }} />
            </div>
          )}
      </div>
      <div className="p-3">
        <div className="text-sm font-medium truncate" style={{ color: C.text }}>{ex.name}</div>
        <div className="text-xs mt-0.5 truncate" style={{ color: C.sub }}>{ex.pattern}</div>
      </div>
    </div>
  );

  return (
    <div className="pb-28">
      <TopBar title="Exercise Library" onLogout={nav.logout}
        right={isCoach && <button onClick={() => setAddOpen(true)}><Plus size={20} style={{ color: C.orange }} /></button>} />
      <div className="px-5 pt-4">
        {/* search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.faint }} />
          <input style={{ ...inputStyle, paddingLeft: 36 }} placeholder="Search exercises..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* phase filter pills */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          <Pill active={phaseFilter === "all"} onClick={() => setPhaseFilter("all")}>
            All ({state.exercises.length})
          </Pill>
          {PHASES.map(p => {
            const count = searchFiltered.filter(e => e.phase === p.key).length;
            return (
              <Pill key={p.key} active={phaseFilter === p.key} onClick={() => setPhaseFilter(p.key)}>
                {p.short} {count > 0 && `(${count})`}
              </Pill>
            );
          })}
        </div>

        {/* content */}
        {phaseFilter === "all" && !search ? (
          // grouped view — section per phase
          <div className="space-y-6">
            {PHASES.map(phase => {
              const exercises = state.exercises.filter(e => e.phase === phase.key);
              if (exercises.length === 0) return null;
              const accent = phaseAccents[phase.key] || C.orange;
              return (
                <div key={phase.key}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-1 h-5 rounded-full shrink-0" style={{ background: accent }} />
                    <span className="font-semibold text-sm" style={{ color: C.text }}>{phase.label}</span>
                    <span className="text-xs font-mono ml-auto shrink-0" style={{ color: C.faint }}>{exercises.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {exercises.map(ex => <ExerciseCard key={ex.id} ex={ex} />)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // flat filtered/searched view
          <div>
            {phaseFilter !== "all" && (
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-5 rounded-full shrink-0" style={{ background: phaseAccents[phaseFilter] || C.orange }} />
                <span className="font-semibold text-sm" style={{ color: C.text }}>
                  {PHASES.find(p => p.key === phaseFilter)?.label}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {searchFiltered
                .filter(e => phaseFilter === "all" || e.phase === phaseFilter)
                .map(ex => <ExerciseCard key={ex.id} ex={ex} />)}
            </div>
            {searchFiltered.filter(e => phaseFilter === "all" || e.phase === phaseFilter).length === 0 && (
              <div className="text-center text-sm py-10" style={{ color: C.faint }}>No exercises match your search.</div>
            )}
          </div>
        )}

        {isCoach && (
          <Btn variant="secondary" className="w-full mt-6" icon={Plus} onClick={() => setAddOpen(true)}>Add Exercise</Btn>
        )}
      </div>

      {isCoach && <AddExerciseModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={addExercise} />}
      <ExerciseDetailModal open={!!detailExercise} onClose={() => setDetailExercise(null)} exercise={detailExercise} />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Exercise">
        <p className="text-sm mb-5" style={{ color: C.text }}>
          Remove <span className="font-semibold">{deleteTarget?.name}</span> from the exercise library? It will also disappear from any program days that currently use it.
        </p>
        <div className="flex gap-2.5">
          <Btn variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Btn>
          <Btn variant="danger" className="flex-1" icon={Trash2} onClick={() => deleteExercise(deleteTarget.id)}>Delete</Btn>
        </div>
      </Modal>
    </div>
  );
}

function CalendarViewPage({ state, nav }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDate, setSelectedDate] = useState(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = todayISO();

  const logsByDate = useMemo(() => {
    const map = {};
    state.workoutLogs.forEach(l => {
      if (!map[l.date]) map[l.date] = [];
      map[l.date].push(l);
    });
    return map;
  }, [state.workoutLogs]);

  const dateStrFor = (day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedLogs = selectedDate ? (logsByDate[selectedDate] || []) : [];

  const blockWeeks = [
    { label: "Week 1-2", focus: "Accumulation" }, { label: "Week 3-4", focus: "Intensification" }, { label: "Week 5-6", focus: "Peak / Taper" }
  ];

  return (
    <div className="pb-28">
      <TopBar title="Calendar" onLogout={nav.logout} />
      <div className="px-5 pt-5">
        <div className="rounded-xl p-4 mb-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() - 1); return d; })}><ChevronLeft size={18} style={{ color: C.sub }} /></button>
            <div className="font-semibold" style={{ fontFamily: "Inter", color: C.text }}>{monthLabel.toUpperCase()}</div>
            <button onClick={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() + 1); return d; })}><ChevronRight size={18} style={{ color: C.sub }} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="text-center text-[10px]" style={{ color: C.faint }}>{d}</div>)}
            {cells.map((d, i) => {
              if (d === null) return <div key={`empty${i}`} />;
              const ds = dateStrFor(d);
              const hasLog = !!logsByDate[ds];
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDate;
              return (
                <button key={ds} onClick={() => setSelectedDate(isSelected ? null : ds)}
                  className="aspect-square rounded-lg flex items-center justify-center text-xs font-mono relative"
                  style={{ background: hasLog ? `${C.orange}22` : C.bg, color: hasLog ? C.orange : C.sub, border: isSelected ? `1px solid ${C.orange}` : isToday ? `1px solid ${C.blue}` : "1px solid transparent" }}>
                  {d}
                  {hasLog && <div className="absolute bottom-1 w-1 h-1 rounded-full" style={{ background: C.orange }} />}
                </button>
              );
            })}
          </div>
        </div>

        {selectedDate && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wide font-semibold mb-2.5" style={{ color: C.sub }}>
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </div>
            {selectedLogs.length === 0 ? (
              <div className="rounded-lg p-3.5 text-sm" style={{ background: C.panel, border: `1px dashed ${C.border}`, color: C.faint }}>No workout logged this day.</div>
            ) : (
              <div className="space-y-2">
                {selectedLogs.map(l => (
                  <div key={l.id} className="rounded-lg p-3.5 flex items-center gap-3" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div className="rounded-lg p-2 shrink-0" style={{ background: C.border }}><CheckCircle2 size={16} style={{ color: C.olive }} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: C.text }}>{l.programDay}</div>
                      <div className="text-xs" style={{ color: C.sub }}>{l.duration} min{l.mood ? ` · felt ${l.mood}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <ChalkDivider label="Training Block Overview" />
        <div className="space-y-2.5">
          {blockWeeks.map(w => (
            <div key={w.label} className="rounded-lg p-3.5 flex items-center justify-between" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <span className="text-sm font-medium" style={{ color: C.text }}>{w.label}</span>
              <span className="text-xs font-mono shrink-0" style={{ color: C.blue }}>{w.focus}</span>
            </div>
          ))}
        </div>

        <ChalkDivider label="Legend" />
        <div className="flex items-center gap-2 text-xs" style={{ color: C.sub }}>
          <div className="w-3 h-3 rounded shrink-0" style={{ background: `${C.orange}22`, border: `1px solid ${C.orange}` }} /> Workout completed
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function CommunityPage({ state, setState, nav }) {
  const [filter, setFilter] = useState("All");
  const [postText, setPostText] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [expandedPost, setExpandedPost] = useState(null);
  const [posts, setPosts] = useState([]);
  const [myUserId, setMyUserId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const isCoach = !state.me?.sport;
  const myName = isCoach ? (state.coachProfile?.name || "Coach") : (state.me?.name || "You");
  const myAvatar = isCoach ? (state.coachProfile?.avatar || "CO") : (state.me?.avatar || "ME");
  const myPhoto = isCoach ? state.coachProfile?.photoUrl : state.me?.photoUrl;

  const loadPosts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id || null;
    setMyUserId(uid);

    const [{ data: postRows }, { data: replyRows }, { data: likeRows }] = await Promise.all([
      supabase.from("community_posts").select("id, text, created_at, user_id, profiles(name, avatar, photo_url, role, sport)").order("created_at", { ascending: false }),
      supabase.from("community_replies").select("id, post_id, text, created_at, user_id, profiles(name, avatar, photo_url, role)").order("created_at", { ascending: true }),
      supabase.from("community_likes").select("post_id, user_id"),
    ]);

    const likesByPost = {};
    (likeRows || []).forEach(l => { likesByPost[l.post_id] = (likesByPost[l.post_id] || 0) + 1; });
    const likedSet = new Set((likeRows || []).filter(l => l.user_id === uid).map(l => l.post_id));

    const merged = (postRows || []).map(p => ({
      id: p.id, text: p.text, time: timeAgo(p.created_at),
      name: p.profiles?.name || "Someone", avatar: p.profiles?.avatar || "?",
      photoUrl: p.profiles?.photo_url, role: p.profiles?.role, sport: p.profiles?.sport,
      likes: likesByPost[p.id] || 0, liked: likedSet.has(p.id),
      replies: (replyRows || []).filter(r => r.post_id === p.id).map(r => ({
        id: r.id, text: r.text, time: timeAgo(r.created_at),
        name: r.profiles?.name || "Someone", avatar: r.profiles?.avatar || "?",
        photoUrl: r.profiles?.photo_url, role: r.profiles?.role,
      })),
    }));
    setPosts(merged);
    setLoaded(true);
  };

  useEffect(() => {
    loadPosts();
    const channel = supabase
      .channel("community-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, loadPosts)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_replies" }, loadPosts)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_likes" }, loadPosts)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filters = ["All", "MMA", "General Fitness", "Coaches"];
  const filteredPosts = posts.filter(p => {
    if (filter === "All") return true;
    if (filter === "Coaches") return p.role === "coach";
    return p.sport === filter;
  });

  const submitPost = async () => {
    if (!postText.trim() || !myUserId) return;
    const text = postText.trim();
    setPostText("");
    await supabase.from("community_posts").insert({ user_id: myUserId, text });
    loadPosts();
  };

  const toggleLike = async (postId) => {
    if (!myUserId) return;
    const post = posts.find(p => p.id === postId);
    if (post?.liked) await supabase.from("community_likes").delete().eq("post_id", postId).eq("user_id", myUserId);
    else await supabase.from("community_likes").insert({ post_id: postId, user_id: myUserId });
    loadPosts();
  };

  const submitReply = async (postId) => {
    if (!replyText.trim() || !myUserId) return;
    const text = replyText.trim();
    setReplyText(""); setReplyTarget(null);
    await supabase.from("community_replies").insert({ post_id: postId, user_id: myUserId, text });
    loadPosts();
  };

  const PostCard = ({ post, expanded }) => (
    <div className="rounded-2xl overflow-hidden" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <Avatar initials={post.avatar} size={38} photoUrl={post.photoUrl}
            accent={post.role === "coach" ? C.orange : C.blue} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: C.text }}>{post.name}</div>
            <div className="flex items-center gap-1.5">
              {post.role === "coach" && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: `${C.orange}22`, color: C.orange }}>COACH</span>}
              {post.sport && <span className="text-[10px]" style={{ color: C.sub }}>{post.sport}</span>}
              <span className="text-[10px]" style={{ color: C.faint }}>· {post.time}</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <p className="text-sm leading-relaxed mb-3" style={{ color: C.text }}>{post.text}</p>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button onClick={() => toggleLike(post.id)} className="flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: post.liked ? C.orange : C.faint }}>
            <span style={{ fontSize: 16 }}>{post.liked ? "❤️" : "🤍"}</span> {post.likes}
          </button>
          <button onClick={() => { setExpandedPost(expanded ? null : post.id); setReplyTarget(null); }}
            className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.faint }}>
            <MessageSquare size={14} /> {post.replies?.length || 0} {post.replies?.length === 1 ? "reply" : "replies"}
          </button>
          <button onClick={() => { setReplyTarget(replyTarget === post.id ? null : post.id); setExpandedPost(post.id); }}
            className="ml-auto text-xs font-semibold" style={{ color: C.orange }}>
            Reply
          </button>
        </div>
      </div>

      {/* Replies */}
      {expanded && (post.replies || []).length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {post.replies.map(r => (
            <div key={r.id} className="px-4 py-3 flex gap-2.5" style={{ borderBottom: `1px solid ${C.border}88` }}>
              <Avatar initials={r.avatar} size={30} photoUrl={r.photoUrl}
                accent={r.role === "coach" ? C.orange : C.blue} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold" style={{ color: C.text }}>{r.name}</span>
                  {r.role === "coach" && <span className="text-[9px] px-1 py-0.5 rounded font-bold" style={{ background: `${C.orange}22`, color: C.orange }}>COACH</span>}
                  <span className="text-[10px]" style={{ color: C.faint }}>{r.time}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: C.text }}>{r.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      {replyTarget === post.id && (
        <div className="px-4 pb-4 pt-2 flex gap-2.5 items-center" style={{ borderTop: `1px solid ${C.border}` }}>
          <Avatar initials={myAvatar} size={30} photoUrl={myPhoto} />
          <input style={{ ...inputStyle, flex: 1, fontSize: 13, padding: "8px 12px" }}
            placeholder="Write a reply..."
            value={replyText} onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitReply(post.id)} />
          <button onClick={() => submitReply(post.id)} className="rounded-full p-2 shrink-0" style={{ background: C.orange }}>
            <Send size={14} style={{ color: "#fff" }} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-screen pb-16">
      <TopBar title="Community" onLogout={nav.logout} />

      {/* Filter tabs */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        {filters.map(f => <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</Pill>)}
      </div>

      {/* Post composer */}
      <div className="px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="flex gap-2.5 items-start">
          <Avatar initials={myAvatar} size={38} photoUrl={myPhoto} />
          <div className="flex-1 flex gap-2 items-end">
            <textarea
              style={{ ...inputStyle, flex: 1, minHeight: 44, maxHeight: 120, resize: "none", fontSize: 14, padding: "10px 12px", lineHeight: 1.4 }}
              placeholder="Share a win, ask a question, or help someone out..."
              value={postText}
              onChange={e => setPostText(e.target.value)}
              rows={1}
            />
            <button onClick={submitPost} disabled={!postText.trim()} className="rounded-full p-2.5 shrink-0"
              style={{ background: postText.trim() ? C.orange : C.border }}>
              <Send size={16} style={{ color: postText.trim() ? "#fff" : C.faint }} />
            </button>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {!loaded && (
          <div className="text-center py-16"><Loader2 size={24} className="animate-spin mx-auto" style={{ color: C.orange }} /></div>
        )}
        {loaded && filteredPosts.length === 0 && (
          <div className="text-center py-16">
            <div className="text-2xl mb-2">🌍</div>
            <div className="text-sm font-semibold" style={{ color: C.text }}>No posts in this category yet</div>
            <p className="text-xs mt-1" style={{ color: C.sub }}>Be the first to start the conversation.</p>
          </div>
        )}
        {filteredPosts.map(post => (
          <PostCard key={post.id} post={post} expanded={expandedPost === post.id} />
        ))}
      </div>
    </div>
  );
}

function NutritionPage({ state, nav }) {
  const meals = [
    { id: 1, name: "Breakfast", cal: 520, p: 38, c: 52, f: 16 },
    { id: 2, name: "Lunch", cal: 680, p: 45, c: 68, f: 20 },
    { id: 3, name: "Post-Workout Shake", cal: 240, p: 32, c: 18, f: 4 },
  ];
  const totals = meals.reduce((a, m) => ({ cal: a.cal + m.cal, p: a.p + m.p, c: a.c + m.c, f: a.f + m.f }), { cal: 0, p: 0, c: 0, f: 0 });

  return (
    <div className="pb-28">
      <TopBar title="Nutrition" onLogout={nav.logout} right={<button><Plus size={20} style={{ color: C.orange }} /></button>} />
      <div className="px-5 pt-5">
        <div className="grid grid-cols-4 gap-2 mb-6">
          <PlateBadge value={totals.cal} label="Cal" />
          <PlateBadge value={`${totals.p}g`} label="Protein" accent={C.blue} />
          <PlateBadge value={`${totals.c}g`} label="Carbs" accent={C.olive} />
          <PlateBadge value={`${totals.f}g`} label="Fat" accent={C.amber} />
        </div>
        <ChalkDivider label="Today's Meals" />
        <div className="space-y-2.5">
          {meals.map(m => (
            <div key={m.id} className="rounded-xl p-3.5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <div className="flex justify-between items-center gap-2">
                <div className="font-medium text-sm truncate" style={{ color: C.text }}>{m.name}</div>
                <div className="font-mono text-sm shrink-0" style={{ color: C.orange }}>{m.cal} cal</div>
              </div>
              <div className="font-mono text-xs mt-1" style={{ color: C.sub }}>P {m.p}g · C {m.c}g · F {m.f}g</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ROOT APP
// ============================================================

function buildMeFromOnboarding(data) {
  const name = (data.name || "").trim() || "You";
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "ME";
  return {
    id: "a1", name, sex: data.sex === "Female" ? "female" : "male",
    sport: data["🥊 Sport / Focus"] || "General Fitness", streak: 0, avatar: initials, photoUrl: data.photoUrl || null,
    program: "p1", customProgram: null,
    injuries: (data.injuries || []).filter(i => i !== "None currently"),
    goals: data.goals || [], isFighter: !!data.isFighter,
    weightKg: lbToKg(data.weightLb || 175), heightCm: data.heightCm || 178,
  };
}

const initialState = () => ({
  // NOTE: athletes/communityPosts/messages/progress/workoutLogs start EMPTY.
  // This is a live app — a real account should never show fake roster members,
  // fake community posts, fake PRs, or fake training history that hasn't
  // actually happened. Programs/exercises remain as a library coaches can
  // assign from; that's template content, not a claim about real usage.
  athletes: [],
  programs: SEED_PROGRAMS,
  exercises: SEED_EXERCISES,
  messages: {},
  progress: [],
  workoutLogs: [],
  sessionCheckins: {}, // { "YYYY-MM-DD": { confirmed: bool, programDay: string, confirmedAt: string } }
  me: { id: "a1", name: "You", sex: "male", sport: "General Fitness", streak: 0, avatar: "ME", program: null, customProgram: null, injuries: [], goals: [], isFighter: false, weightKg: 79.4, heightCm: 178 },
  coachProfile: { name: "Coach", avatar: "CO", photoUrl: null, accountabilityEnabled: true },
  payments: { rates: [], clientBilling: {}, methods: [] },
  communityPosts: [],
});

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("App crashed:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: 24, fontFamily: "monospace", fontSize: 13, whiteSpace: "pre-wrap", overflowY: "auto" }}>
          <div style={{ color: "#ff6b6b", fontWeight: "bold", fontSize: 16, marginBottom: 12 }}>Something crashed — screenshot this and send it over:</div>
          <div style={{ marginBottom: 12 }}>{String(this.state.error?.message || this.state.error)}</div>
          <div style={{ opacity: 0.6, fontSize: 11 }}>{this.state.error?.stack}</div>
          <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: "10px 16px", background: "#ff6600", color: "#fff", border: "none", borderRadius: 8, fontFamily: "sans-serif", fontWeight: 600 }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}

function AppInner() {
  const [authed, setAuthed] = useState(null);
  const [view, setView] = useState(null);
  const [navParam, setNavParam] = useState(null);
  const [state, setState] = useState(initialState);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authMode, setAuthMode] = useState("onboarding"); // 'onboarding' | 'login'
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = FONT_LINK;
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  // Turn a DB profile row into the local `me` / `coachProfile` shape the rest of the app expects.
  const hydrateFromProfile = async (profile) => {
    if (profile.role === "coach") {
      setState(s => ({ ...s, coachProfile: { ...s.coachProfile, name: profile.name, avatar: profile.avatar, photoUrl: profile.photo_url } }));
    } else {
      setState(s => ({
        ...s,
        me: {
          ...s.me, id: profile.id, name: profile.name, avatar: profile.avatar, photoUrl: profile.photo_url,
          sport: profile.sport, sex: profile.sex, isFighter: profile.is_fighter,
          injuries: profile.injuries || [], goals: profile.goals || [],
          weightKg: profile.weight_kg, heightCm: profile.height_cm, streak: profile.streak || 0,
          selfGuided: profile.role === "athlete", hasCoach: profile.role === "athlete_coached",
          intake: profile.intake || {}, program: null,
        }
      }));

      // Restore this athlete's real program, workout history, and progress from the database.
      const [{ data: programRow }, { data: logRows }, { data: progressRows }] = await Promise.all([
        profile.active_program_id
          ? supabase.from("programs").select("*").eq("id", profile.active_program_id).single()
          : Promise.resolve({ data: null }),
        supabase.from("workout_logs").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }),
        supabase.from("progress_entries").select("*").eq("user_id", profile.id).order("created_at", { ascending: true }),
      ]);

      setState(s => {
        let next = s;
        if (programRow) {
          const { days, newExercises } = buildDaysWithExerciseIds(programRow.days, s);
          const program = { id: programRow.id, name: programRow.name, weeks: programRow.weeks, assignedCount: 1, sport: programRow.sport, days };
          next = { ...next, programs: [...next.programs, program], exercises: [...next.exercises, ...newExercises], me: { ...next.me, program: program.id } };
        }
        if (logRows?.length) {
          next = { ...next, workoutLogs: logRows.map(l => ({ id: l.id, date: l.date, programDay: l.program_day, duration: l.duration, mood: l.mood })) };
        }
        if (progressRows?.length) {
          next = { ...next, progress: progressRows.map(p => ({ date: new Date(p.created_at).toLocaleDateString(), weightKg: p.weight_kg, bodyFat: p.body_fat })) };
        }
        return next;
      });
    }
    setAuthed(profile.role);
    setView(profile.role === "coach" ? "coach-dashboard" : "athlete-dashboard");
  };

  // On load: restore an existing session so refreshing the page doesn't log people out.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { if (active) setSessionLoading(false); return; }
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (active) {
        if (profile) await hydrateFromProfile(profile);
        setSessionLoading(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { setAuthed(null); setView(null); }
    });
    return () => { active = false; listener?.subscription?.unsubscribe(); };
  }, []);

  const [generatingProgram, setGeneratingProgram] = useState(false);

  // Returns an error string on failure, or undefined on success (caller navigates away on success).
  // Extracts a readable message no matter what shape the error comes in —
  // a Supabase error, a network failure, or anything else — so we never show
  // a blank "{}" again.
  const errText = (e) => {
    if (!e) return "Something went wrong. Please try again.";
    if (typeof e === "string") return e;
    if (e.message) return e.message;
    if (e.error_description) return e.error_description;
    try { const s = JSON.stringify(e); return s === "{}" ? "Unknown error — check your connection and try again." : s; }
    catch { return String(e); }
  };

  const handleOnboardComplete = async (role, data) => {
    try {
    const { data: signUpData, error } = await supabase.auth.signUp({ email: data.email, password: data.password });
    if (error) return errText(error);

    // Never persist the raw password (or UI-only noise) anywhere outside Supabase's
    // own hashed auth storage — this is what gets saved as "intake" for later reuse.
    const { password, signupError, showPassword, ...safeIntake } = data;

    const name = (data.name || "").trim() || (role === "coach" ? "Coach" : "You");
    const avatar = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "ME";
    const userId = signUpData.user?.id;

    if (userId) {
      const profileRow = role === "coach"
        ? { id: userId, role, name, avatar, photo_url: data.photoUrl || null }
        : {
            id: userId, role, name, avatar, photo_url: data.photoUrl || null,
            sport: data["🥊 Sport / Focus"] || "General Fitness", sex: data.sex === "Female" ? "female" : "male",
            is_fighter: !!data.isFighter, injuries: (data.injuries || []).filter(i => i !== "None currently"),
            goals: data.goals || [], weight_kg: lbToKg(data.weightLb || 175), height_cm: data.heightCm || 178,
            intake: safeIntake,
          };
      const { error: profileError } = await supabase.from("profiles").insert(profileRow);
      if (profileError) return errText(profileError);
    }

    // Supabase may require email confirmation before a session exists — if so, we can't
    // log them in yet. Show a "check your email" screen instead of the dashboard.
    if (!signUpData.session) {
      setPendingConfirmEmail(data.email);
      return;
    }

    if (role === "athlete" || role === "athlete_coached") {
      const me = { ...buildMeFromOnboarding(data), id: userId, program: null, selfGuided: role === "athlete", hasCoach: role === "athlete_coached", intake: safeIntake };
      setState(s => ({ ...s, me }));
      setAuthed(role);
      setGeneratingProgram(true);
      try {
        const response = await fetch("/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 8192, messages: [{ role: "user", content: buildAIPrompt(data) }] })
        });
        const apiData = await response.json();
        const textBlock = (apiData.content || []).find(b => b.type === "text");
        const parsed = parseAIJson(textBlock?.text);
        const weeks = parsed.weeks || 6;
        const sport = data["🥊 Sport / Focus"] || "General Fitness";
        const dbId = userId ? await createProgramRow(userId, parsed.programName, weeks, sport, parsed.days) : null;
        setState(s => applyGeneratedProgram(parsed, s, data, dbId));
      } catch (err) {
        // generation failed — athlete lands on dashboard without a program, same as before
      }
      setGeneratingProgram(false);
      setView("athlete-dashboard");
    } else {
      setState(s => ({ ...s, coachProfile: { ...s.coachProfile, name, avatar, photoUrl: data.photoUrl || null } }));
      setAuthed(role);
      setView("coach-dashboard");
    }
    } catch (err) {
      setGeneratingProgram(false);
      return errText(err);
    }
  };

  const handleLogin = async (email, password) => {
    try {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return errText(error);
      const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", signInData.user.id).single();
      if (profileError || !profile) return "We couldn't find a profile for this account. Please contact support.";
      await hydrateFromProfile(profile);
    } catch (err) {
      return errText(err);
    }
  };

  const nav = {
    go: (key, param) => { setView(key); setNavParam(param ?? null); },
    logout: () => { supabase.auth.signOut(); setAuthed(null); setView(null); setState(initialState()); },
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <Loader2 size={32} className="animate-spin" style={{ color: C.orange }} />
      </div>
    );
  }

  if (pendingConfirmEmail) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: C.bg }}>
        <Mail size={40} style={{ color: C.orange }} />
        <h2 className="mt-4 text-2xl font-bold" style={{ fontFamily: "Inter", color: C.text }}>Check your email</h2>
        <p className="mt-2 text-sm" style={{ color: C.sub }}>We sent a confirmation link to {pendingConfirmEmail}. Confirm it, then come back and log in.</p>
        <button onClick={() => { setPendingConfirmEmail(null); setAuthMode("login"); }} className="mt-6 text-sm font-semibold" style={{ color: C.orange }}>Back to login</button>
      </div>
    );
  }

  if (!authed || generatingProgram) {
    if (generatingProgram) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: C.bg }}>
          <Loader2 size={40} className="animate-spin mb-6" style={{ color: C.orange }} />
          <h2 className="text-2xl font-bold text-center" style={{ fontFamily: "Inter", color: C.text }}>Building your program</h2>
          <p className="text-sm mt-2 text-center" style={{ color: C.sub }}>AI is creating a personalized plan based on your goals, sport, schedule, and equipment.</p>
        </div>
      );
    }
    if (authMode === "login") {
      return <div style={{ fontFamily: "Inter, sans-serif" }}><LoginScreen onLogin={handleLogin} onSwitchToSignup={() => setAuthMode("onboarding")} /></div>;
    }
    return <div style={{ fontFamily: "Inter, sans-serif" }}><Onboarding onComplete={handleOnboardComplete} onSwitchToLogin={() => setAuthMode("login")} /></div>;
  }

  const coachNavItems = [
    { key: "coach-dashboard", label: "Home", icon: Home },
    { key: "coach-athletes", label: "Athletes", icon: Users },
    { key: "community", label: "Community", icon: MessageSquare },
    { key: "coach-payments", label: "Payments", icon: Award },
    { key: "coach-profile", label: "Profile", icon: User },
  ];
  const athleteNavItems = [
    { key: "athlete-dashboard", label: "Home", icon: LayoutGrid },
    { key: "athlete-program", label: "Program", icon: Dumbbell },
    { key: "athlete-workout", label: "Workout", icon: Flame },
    { key: "community", label: "Community", icon: MessageSquare },
    { key: "athlete-ai", label: "AI Coach", icon: Bot },
    { key: "athlete-profile", label: "Profile", icon: User },
  ];
  const navItems = authed === "coach" ? coachNavItems : athleteNavItems;

  const pages = {
    "coach-dashboard": <CoachDashboard state={state} setState={setState} nav={nav} />,
    "coach-athletes": <CoachAthletes state={state} setState={setState} nav={nav} />,
    "coach-athlete-detail": <CoachAthleteDetail state={state} setState={setState} nav={nav} athleteId={navParam} />,
    "coach-programs": <CoachPrograms state={state} setState={setState} nav={nav} />,
    "coach-messages": <CoachMessages state={state} setState={setState} nav={nav} />,
    "coach-payments": <CoachPayments state={state} setState={setState} nav={nav} />,
    "coach-profile": <CoachProfile state={state} setState={setState} nav={nav} />,
    "athlete-dashboard": <AthleteDashboard state={state} setState={setState} nav={nav} />,
    "athlete-program": <AthleteProgram state={state} setState={setState} nav={nav} />,
    "athlete-workout": <Workout state={state} setState={setState} nav={nav} />,
    "athlete-progress": <AthleteProgress state={state} setState={setState} nav={nav} />,
    "athlete-ai": <AthleteMessages state={state} setState={setState} nav={nav} />,
    "athlete-profile": <AthleteProfile state={state} setState={setState} nav={nav} />,
    "exercise-library": <ExerciseLibraryPage state={state} setState={setState} nav={nav} isCoach={authed === "coach"} />,
    "community": <CommunityPage state={state} setState={setState} nav={nav} />,
    "calendar": <CalendarViewPage state={state} nav={nav} />,
    "nutrition": <NutritionPage state={state} nav={nav} />,
  };

  const activeNavKey = navItems.find(i => i.key === view) ? view : navItems[0].key;

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: C.bg, minHeight: "100vh" }}>
      {pages[view] || pages[authed === "coach" ? "coach-dashboard" : "athlete-dashboard"]}
      <BottomNav items={navItems} active={activeNavKey} onChange={(key) => nav.go(key)} />
    </div>
  );
}
