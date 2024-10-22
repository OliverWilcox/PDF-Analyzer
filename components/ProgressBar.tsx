// components/ProgressBar.tsx

import React from "react";
import { motion } from "framer-motion";

interface ProgressBarProps {
  progress: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  return (
    <div className="w-full h-4 bg-gray-700 rounded-full overflow-hidden">
      <motion.div
        className="h-full bg-purple-500"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      />
    </div>
  );
};

export default ProgressBar;
