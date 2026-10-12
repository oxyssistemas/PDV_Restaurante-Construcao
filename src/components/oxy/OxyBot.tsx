import { motion, useReducedMotion } from 'framer-motion';
import type { OxyMood } from '@/lib/oxyTours';

const ORANGE = '#F97316';
const ORANGE_DARK = '#EA580C';
const SCREEN = '#0F172A';
const LIGHT = '#67E8F9';

const pivot = (x: number, y: number) => ({ transformBox: 'view-box' as const, transformOrigin: `${x}px ${y}px` });

/**
 * Oxy, o robô chef da Oxys. Desenho em SVG animado:
 * idle (respira e pisca), talk (mexe a boca), wave (acena), point (aponta) e celebrate (pula e comemora).
 */
export default function OxyBot({ mood = 'idle', size = 96, className }: { mood?: OxyMood; size?: number; className?: string }) {
  const reduce = useReducedMotion();
  const loop = (duration: number) => (reduce ? { duration: 0 } : { duration, repeat: Infinity, ease: 'easeInOut' as const });

  const bodyAnim = mood === 'celebrate'
    ? { y: [0, -14, 0, -8, 0] }
    : { y: [0, -3, 0] };

  const rightArm = mood === 'wave' ? { rotate: [-150, -115, -150, -115, -150] }
    : mood === 'point' ? { rotate: [-100, -92, -100] }
    : mood === 'celebrate' ? { rotate: [-150, -135, -150] }
    : { rotate: [0, 4, 0] };
  const leftArm = mood === 'celebrate' ? { rotate: [150, 135, 150] } : { rotate: [0, -4, 0] };
  const talking = mood === 'talk' || mood === 'wave' || mood === 'point';

  return (
    <svg viewBox="0 0 120 160" width={size} height={size * (160 / 120)} className={className} role="img" aria-label="Oxy, o assistente da Oxys">
      <ellipse cx="60" cy="154" rx="26" ry="4" fill="#000" opacity="0.2" />
      <motion.g animate={reduce ? undefined : bodyAnim} transition={loop(mood === 'celebrate' ? 1.2 : 3)}>
        {/* pernas */}
        <rect x="45" y="136" width="11" height="13" rx="4" fill="#9A3412" />
        <rect x="64" y="136" width="11" height="13" rx="4" fill="#9A3412" />

        {/* braço esquerdo */}
        <motion.g style={pivot(36, 106)} animate={reduce ? undefined : leftArm} transition={loop(mood === 'celebrate' ? 0.6 : 3)}>
          <rect x="24" y="104" width="12" height="28" rx="6" fill={ORANGE} />
          <circle cx="30" cy="134" r="6.5" fill="#FFF" />
        </motion.g>
        {/* braço direito (acena e aponta) */}
        <motion.g style={pivot(84, 106)} animate={reduce ? undefined : rightArm} transition={loop(mood === 'wave' ? 1.4 : mood === 'celebrate' ? 0.6 : 3)}>
          <rect x="84" y="104" width="12" height="28" rx="6" fill={ORANGE} />
          <circle cx="90" cy="134" r="6.5" fill="#FFF" />
        </motion.g>

        {/* corpo com avental e o "O" da Oxys */}
        <rect x="34" y="98" width="52" height="42" rx="16" fill={ORANGE_DARK} />
        <path d="M44 103 h32 v25 q0 9 -9 9 h-14 q-9 0 -9 -9z" fill="#FFF" />
        <circle cx="60" cy="118" r="6" fill="none" stroke={ORANGE} strokeWidth="2.6" />
        <rect x="52" y="92" width="16" height="8" rx="3" fill="#C2410C" />

        {/* cabeça */}
        <circle cx="22" cy="70" r="6" fill={ORANGE_DARK} />
        <circle cx="98" cy="70" r="6" fill={ORANGE_DARK} />
        <rect x="22" y="40" width="76" height="56" rx="22" fill={ORANGE} />
        <rect x="31" y="49" width="58" height="38" rx="13" fill={SCREEN} />

        {/* olhos (piscam) */}
        <motion.g
          style={pivot(60, 66)}
          animate={reduce ? undefined : { scaleY: [1, 1, 0.1, 1] }}
          transition={reduce ? undefined : { duration: 4, repeat: Infinity, times: [0, 0.9, 0.95, 1] }}
        >
          {mood === 'celebrate' ? (
            <>
              <path d="M43 68 l5 -6 l5 6" fill="none" stroke={LIGHT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M67 68 l5 -6 l5 6" fill="none" stroke={LIGHT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : (
            <>
              <rect x="43.5" y="60" width="9" height="11" rx="4.5" fill={LIGHT} />
              <rect x="67.5" y="60" width="9" height="11" rx="4.5" fill={LIGHT} />
            </>
          )}
        </motion.g>

        {/* boca: sorriso, ou abrindo e fechando enquanto fala */}
        {talking && !reduce ? (
          <motion.ellipse cx="60" cy="79" rx="6" fill={LIGHT}
            animate={{ ry: [1.5, 4, 2, 4.5, 1.5] }} transition={{ duration: 0.9, repeat: Infinity }} />
        ) : (
          <path d="M51 77 Q60 85 69 77" fill="none" stroke={LIGHT} strokeWidth="3" strokeLinecap="round" />
        )}

        {/* chapéu de chef */}
        <rect x="34" y="30" width="52" height="13" rx="4" fill="#FFF" stroke="#E5E7EB" />
        <circle cx="44" cy="24" r="12" fill="#FFF" />
        <circle cx="60" cy="17" r="14" fill="#FFF" />
        <circle cx="76" cy="24" r="12" fill="#FFF" />
        <rect x="36" y="28" width="48" height="8" fill="#FFF" />
      </motion.g>
    </svg>
  );
}
