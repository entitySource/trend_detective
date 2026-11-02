// Adapted from Skecher UI (https://skecher-ui.com/docs/streaming-text), source-owned registry component.
// Changes: words keyed by position (repeated words broke the original's keys) and the motion element is
// created once per tag instead of on every render (which remounted the text and replayed the reveal).
import { motion } from 'motion/react'
import type React from 'react'

type StreamingTextProps = {
  text: string
  className?: string
  wordClassName?: string
  staggerChildren?: number
  delayChildren?: number
  blurFrom?: string
  blurTo?: string
  duration?: number
  as?: 'p' | 'span' | 'div'
}

const TAGS = { p: motion.p, span: motion.span, div: motion.div } as const

export const StreamingText: React.FC<StreamingTextProps> = ({
  text,
  className,
  wordClassName = '',
  staggerChildren = 0.03,
  delayChildren = 0.1,
  blurFrom = '8px',
  blurTo = '0px',
  duration = 0.25,
  as = 'p',
}) => {
  const MotionTag = TAGS[as]
  const words = text.split(' ')

  return (
    <MotionTag
      className={className}
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren, delayChildren } }, hidden: {} }}
      aria-label={text}
    >
      {words.map((word, i) => (
        <motion.span
          key={i}
          aria-hidden
          className={wordClassName}
          variants={{
            hidden: { filter: `blur(${blurFrom})`, opacity: 0 },
            visible: { filter: `blur(${blurTo})`, opacity: 1 },
          }}
          transition={{ duration }}
          style={{ display: 'inline-block', whiteSpace: 'pre' }}
        >
          {word + (i < words.length - 1 ? ' ' : '')}
        </motion.span>
      ))}
    </MotionTag>
  )
}
