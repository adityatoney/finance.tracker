"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onFileAccepted: (file: File) => void;
  disabled?: boolean;
  selectedFile?: File | null;
}

export function FileDropzone({ onFileAccepted, disabled, selectedFile }: FileDropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileAccepted(acceptedFiles[0]);
      }
    },
    [onFileAccepted]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "text/csv": [".csv"],
    },
    maxFiles: 1,
    disabled,
  });

  if (selectedFile) {
    return (
      <div
        {...getRootProps()}
        className={cn(
          "flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20 px-4 py-3 cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors",
          disabled && "opacity-40 cursor-not-allowed pointer-events-none"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
          <FileCheck2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{selectedFile.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {(selectedFile.size / 1024).toFixed(1)} KB · Click to change
          </p>
        </div>
        <div className="flex gap-1.5">
          <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {selectedFile.name.endsWith(".pdf") ? "PDF" : "CSV"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        "rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer",
        isDragActive && "border-primary bg-primary/5 scale-[1.005]",
        disabled
          ? "opacity-40 cursor-not-allowed pointer-events-none bg-muted/30"
          : "hover:border-primary/50 hover:bg-muted/20"
      )}
    >
      <div className="flex flex-col items-center justify-center py-8">
        <input {...getInputProps()} />
        <div className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full mb-3 transition-colors",
          isDragActive ? "bg-primary/10" : "bg-muted"
        )}>
          <Upload className={cn(
            "h-5 w-5 transition-colors",
            isDragActive ? "text-primary" : "text-muted-foreground"
          )} />
        </div>
        {isDragActive ? (
          <p className="text-sm font-medium text-primary">Drop file here</p>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-medium">Drop a statement</span>
              <span className="text-muted-foreground"> or </span>
              <span className="font-medium text-primary underline underline-offset-4">browse</span>
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">PDF</span>
              <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">CSV</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
