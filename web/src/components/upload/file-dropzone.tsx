"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileCheck2, X, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Single file mode (backward compatible) ──

interface SingleFileDropzoneProps {
  mode?: "single";
  onFileAccepted: (file: File) => void;
  disabled?: boolean;
  selectedFile?: File | null;
}

// ── Multi file mode ──

export interface FileEntry {
  id: string;
  file: File;
  statementDate: string;
}

interface MultiFileDropzoneProps {
  mode: "multi";
  files: FileEntry[];
  onFilesAdded: (files: File[]) => void;
  onFileRemove: (id: string) => void;
  onFileDateChange: (id: string, date: string) => void;
  disabled?: boolean;
}

type FileDropzoneProps = SingleFileDropzoneProps | MultiFileDropzoneProps;

export function FileDropzone(props: FileDropzoneProps) {
  if ("mode" in props && props.mode === "multi") {
    return <MultiDropzone {...props} />;
  }
  return <SingleDropzone {...(props as SingleFileDropzoneProps)} />;
}

// ── Multi-file dropzone ──

function MultiDropzone({
  files,
  onFilesAdded,
  onFileRemove,
  onFileDateChange,
  disabled,
}: MultiFileDropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFilesAdded(acceptedFiles);
      }
    },
    [onFilesAdded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "text/csv": [".csv"],
    },
    disabled,
    multiple: true,
  });

  return (
    <div className="space-y-3">
      {/* Drop area */}
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
        <div className="flex flex-col items-center justify-center py-6">
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
            <p className="text-sm font-medium text-primary">Drop files here</p>
          ) : (
            <>
              <p className="text-sm">
                <span className="font-medium">Drop statements</span>
                <span className="text-muted-foreground"> or </span>
                <span className="font-medium text-primary underline underline-offset-4">browse</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Multiple files supported · PDF and CSV
              </p>
            </>
          )}
        </div>
      </div>

      {/* File list with per-file date pickers */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{entry.file.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {(entry.file.size / 1024).toFixed(1)} KB · {entry.file.name.endsWith(".pdf") ? "PDF" : "CSV"}
                </p>
              </div>
              <Input
                type="month"
                value={entry.statementDate}
                onChange={(e) => onFileDateChange(entry.id, e.target.value)}
                className="h-8 w-36 text-xs"
                placeholder="YYYY-MM"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => onFileRemove(entry.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single-file dropzone (unchanged behavior) ──

function SingleDropzone({ onFileAccepted, disabled, selectedFile }: SingleFileDropzoneProps) {
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
        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {selectedFile.name.endsWith(".pdf") ? "PDF" : "CSV"}
        </span>
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
