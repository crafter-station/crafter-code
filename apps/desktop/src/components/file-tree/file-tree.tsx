"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { readDirectory, type FileEntry } from "@/lib/ipc/commands";

interface FileTreeProps {
  rootPath: string;
  className?: string;
  onFileSelect?: (path: string) => void;
}

interface TreeNode extends FileEntry {
  children?: TreeNode[];
  isLoading?: boolean;
  isExpanded?: boolean;
}

export function FileTree({ rootPath, className, onFileSelect }: FileTreeProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load root directory
  useEffect(() => {
    const loadRoot = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const entries = await readDirectory(rootPath);
        setTree(entries.map((e) => ({ ...e, isExpanded: false })));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load directory");
      } finally {
        setIsLoading(false);
      }
    };

    loadRoot();
  }, [rootPath]);

  // Toggle directory expansion
  const toggleDirectory = useCallback(async (path: string) => {
    setTree((prevTree) => {
      const updateNode = (nodes: TreeNode[]): TreeNode[] => {
        return nodes.map((node) => {
          if (node.path === path) {
            if (node.isExpanded) {
              return { ...node, isExpanded: false };
            }
            // Load children if not loaded
            if (!node.children) {
              node.isLoading = true;
              readDirectory(path)
                .then((children) => {
                  setTree((t) =>
                    updateNodeInTree(t, path, {
                      children: children.map((c) => ({ ...c, isExpanded: false })),
                      isLoading: false,
                      isExpanded: true,
                    })
                  );
                })
                .catch((err) => {
                  console.error("Failed to load directory:", err);
                  setTree((t) =>
                    updateNodeInTree(t, path, { isLoading: false })
                  );
                });
              return { ...node, isLoading: true };
            }
            return { ...node, isExpanded: true };
          }
          if (node.children) {
            return { ...node, children: updateNode(node.children) };
          }
          return node;
        });
      };

      return updateNode(prevTree);
    });
  }, []);

  // Helper to update a specific node
  const updateNodeInTree = (
    nodes: TreeNode[],
    path: string,
    updates: Partial<TreeNode>
  ): TreeNode[] => {
    return nodes.map((node) => {
      if (node.path === path) {
        return { ...node, ...updates };
      }
      if (node.children) {
        return { ...node, children: updateNodeInTree(node.children, path, updates) };
      }
      return node;
    });
  };

  if (isLoading) {
    return (
      <div className={cn("p-4 text-muted-foreground text-sm", className)}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("p-4 text-destructive text-sm", className)}>
        {error}
      </div>
    );
  }

  return (
    <div className={cn("overflow-auto text-sm", className)}>
      <TreeNodeList
        nodes={tree}
        depth={0}
        onToggle={toggleDirectory}
        onFileSelect={onFileSelect}
      />
    </div>
  );
}

interface TreeNodeListProps {
  nodes: TreeNode[];
  depth: number;
  onToggle: (path: string) => void;
  onFileSelect?: (path: string) => void;
}

function TreeNodeList({ nodes, depth, onToggle, onFileSelect }: TreeNodeListProps) {
  return (
    <ul className="list-none">
      {nodes.map((node) => (
        <TreeNodeItem
          key={node.path}
          node={node}
          depth={depth}
          onToggle={onToggle}
          onFileSelect={onFileSelect}
        />
      ))}
    </ul>
  );
}

interface TreeNodeItemProps {
  node: TreeNode;
  depth: number;
  onToggle: (path: string) => void;
  onFileSelect?: (path: string) => void;
}

function TreeNodeItem({ node, depth, onToggle, onFileSelect }: TreeNodeItemProps) {
  const handleClick = () => {
    if (node.is_dir) {
      onToggle(node.path);
    } else {
      onFileSelect?.(node.path);
    }
  };

  const Icon = node.is_dir
    ? node.isExpanded
      ? FolderOpen
      : Folder
    : File;

  const ChevronIcon = node.isExpanded ? ChevronDown : ChevronRight;

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-1 px-2 py-1 text-left hover:bg-accent/50 rounded-sm transition-colors",
          node.is_hidden && "text-muted-foreground"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.is_dir ? (
          <ChevronIcon className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3.5" />
        )}
        <Icon
          className={cn(
            "size-4 shrink-0",
            node.is_dir ? "text-accent-orange" : "text-muted-foreground"
          )}
        />
        <span className="truncate">{node.name}</span>
        {node.isLoading && (
          <span className="ml-auto text-xs text-muted-foreground">...</span>
        )}
      </button>
      {node.isExpanded && node.children && (
        <TreeNodeList
          nodes={node.children}
          depth={depth + 1}
          onToggle={onToggle}
          onFileSelect={onFileSelect}
        />
      )}
    </li>
  );
}
