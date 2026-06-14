import { motion, type HTMLMotionProps } from "framer-motion";

export type HapticButtonProps = HTMLMotionProps<"button">;

export function HapticButton({
  children,
  type = "button",
  transition,
  ...props
}: HapticButtonProps) {
  return (
    <motion.button
      type={type}
      whileTap={{ scale: 0.9 }}
      transition={transition ?? { type: "spring", stiffness: 400, damping: 17 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
