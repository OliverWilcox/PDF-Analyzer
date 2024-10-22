// components/Button.tsx

import React from "react";
import { motion } from "framer-motion";

interface ButtonProps {
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const Button: React.FC<ButtonProps> = ({
  onClick,
  disabled,
  icon,
  children,
  className,
}) => {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={`bg-purple-500 text-white px-8 py-4 rounded-lg font-semibold flex items-center justify-center transition duration-300 ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-purple-600"
      } ${className}`}
      whileHover={!disabled ? { scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
    >
      {icon}
      {children}
    </motion.button>
  );
};

export default Button;
