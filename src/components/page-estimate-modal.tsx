import React from "react";
import { IconX, IconBook, IconLayoutCards } from "@tabler/icons-react";

interface PageEstimateModalProps {
  currentFormat: string;
  onFormatChange: (format: string) => void;
  onClose: () => void;
}

const PageEstimateModal: React.FC<PageEstimateModalProps> = ({
  currentFormat,
  onFormatChange,
  onClose,
}) => {
  const pageFormats = [
    {
      id: "novel",
      name: "Novel",
      description: "Approximately 250 words per page",
      icon: <IconBook size={24} strokeWidth={1.5} />,
    },
    {
      id: "a4",
      name: "A4 Document",
      description: "Approximately 500 words per page (double-spaced)",
      icon: <IconLayoutCards size={24} strokeWidth={1.5} />,
    },
    {
      id: "a5",
      name: "A5 Document",
      description: "Approximately 300 words per page",
      icon: <IconLayoutCards size={24} strokeWidth={1.5} />,
    },
  ];

  const handleFormatSelect = (format: string) => {
    onFormatChange(format);
  };

  return (
    <div
      className={`absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center z-50`}
    >
      <div
        className={`absolute top-0 left-0 bottom-0 right-0 bg-neutral-900 opacity-50`}
      ></div>

      <div className={`bg-white p-4 rounded-xl shadow-lg max-w-md z-50`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Page Format</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500"
          >
            <IconX size={20} strokeWidth={2} />
          </button>
        </div>

        <p className="text-neutral-600 mb-4">
          Select a page format to estimate how many pages your content would
          fill:
        </p>

        <div className="space-y-3">
          {pageFormats.map((format) => (
            <div
              key={format.id}
              onClick={() => handleFormatSelect(format.id)}
              className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                currentFormat === format.id
                  ? "border-mercedes-primary bg-mercedes-primary/5"
                  : "border-neutral-300 hover:border-neutral-400"
              }`}
            >
              <div className="flex items-center">
                <div
                  className={`mr-3 ${
                    currentFormat === format.id
                      ? "text-mercedes-primary"
                      : "text-neutral-500"
                  }`}
                >
                  {format.icon}
                </div>
                <div>
                  <h4 className="font-medium">{format.name}</h4>
                  <p className="text-sm text-neutral-500">
                    {format.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-mercedes-primary text-white rounded-lg hover:bg-mercedes-primary/90 transition-all duration-200"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default PageEstimateModal;
