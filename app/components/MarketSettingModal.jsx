"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, Reorder } from "framer-motion";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { CloseIcon, MinusIcon, ResetIcon, SettingsIcon } from "./Icons";
import ConfirmModal from "./ConfirmModal";
import { cn } from "@/lib/utils";

/**
 * 指数个性化设置弹框
 *
 * - 移动端：使用 Drawer（自底向上抽屉）
 * - PC 端：使用 Dialog（居中弹窗）
 *
 * @param {Object} props
 * @param {boolean} props.open - 是否打开
 * @param {() => void} props.onClose - 关闭回调
 * @param {boolean} props.isMobile - 是否为移动端（由上层传入）
 * @param {Array<{code:string,name:string,price:number,change:number,changePercent:number}>} props.indices - 当前可用的大盘指数列表
 * @param {string[]} props.selectedCodes - 已选中的指数 code，决定展示顺序
 * @param {(codes: string[]) => void} props.onChangeSelected - 更新选中指数集合
 * @param {() => void} props.onResetDefault - 恢复默认选中集合
 */
export default function MarketSettingModal({
  open,
  onClose,
  isMobile,
  indices = [],
  selectedCodes = [],
  onChangeSelected,
  onResetDefault,
}) {
  const selectedList = useMemo(() => {
    if (!indices?.length || !selectedCodes?.length) return [];
    const map = new Map(indices.map((it) => [it.code, it]));
    return selectedCodes
      .map((code) => map.get(code))
      .filter(Boolean);
  }, [indices, selectedCodes]);

  const allIndices = indices || [];
  const selectedSet = useMemo(
    () => new Set(selectedCodes || []),
    [selectedCodes]
  );

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const handleToggleCode = (code) => {
    if (!code) return;
    if (selectedSet.has(code)) {
      // 至少保留一个指数，阻止把最后一个也移除
      if (selectedCodes.length <= 1) return;
      const next = selectedCodes.filter((c) => c !== code);
      onChangeSelected?.(next);
    } else {
      const next = [...selectedCodes, code];
      onChangeSelected?.(next);
    }
  };

  const handleReorder = (newOrder) => {
    onChangeSelected?.(newOrder);
  };

  const body = (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-2 text-[var(--text)]">
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>已添加指数</div>
            <div
              className="muted"
              style={{ fontSize: 12, color: "var(--muted-foreground)" }}
            >
              拖动下方指数即可排序
            </div>
          </div>
        </div>

        {selectedList.length === 0 ? (
          <div
            className="muted"
            style={{
              fontSize: 13,
              color: "var(--muted-foreground)",
              padding: "12px 0 4px",
            }}
          >
            暂未添加指数，请在下方选择想要关注的指数。
          </div>
        ) : (
          <Reorder.Group
            as="div"
            axis="y"
            values={selectedCodes}
            onReorder={handleReorder}
            className="flex flex-wrap gap-3"
          >
            <AnimatePresence initial={false}>
              {selectedList.map((item) => {
                const isUp = item.change >= 0;
                const color =
                  isUp ? "var(--danger)" : "var(--success)";
                return (
                  <Reorder.Item
                    key={item.code}
                    value={item.code}
                    className={cn(
                      "glass card",
                      "relative flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                    )}
                    style={{
                      cursor: "grab",
                      flex: "0 0 calc((100% - 24px) / 3)",
                    }}
                  >
                    {selectedCodes.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCode(item.code);
                        }}
                        className="icon-button"
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          width: 18,
                          height: 18,
                          borderRadius: "999px",
                          backgroundColor: "rgba(255,96,96,0.1)",
                          color: "var(--danger)",
                          border: "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        aria-label={`移除 ${item.name}`}
                      >
                        <MinusIcon width="10" height="10" />
                      </button>
                    )}
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        paddingRight: 18,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 600,
                        color,
                      }}
                    >
                      {item.price?.toFixed
                        ? item.price.toFixed(2)
                        : String(item.price ?? "-")}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color,
                      }}
                    >
                      {(item.change >= 0 ? "+" : "") +
                        item.change.toFixed(2)}{" "}
                      {(item.changePercent >= 0 ? "+" : "") +
                        item.changePercent.toFixed(2)}
                      %
                    </div>
                  </Reorder.Item>
                );
              })}
            </AnimatePresence>
          </Reorder.Group>
        )}
      </div>

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <div
            className="muted"
            style={{
              fontSize: 13,
              color: "var(--muted-foreground)",
            }}
          >
            点击即可选指数
          </div>
          {onResetDefault && (
            <button
              type="button"
              className="icon-button"
              onClick={() => setResetConfirmOpen(true)}
              style={{
                border: "none",
                width: 28,
                height: 28,
                backgroundColor: "transparent",
                color: "var(--muted-foreground)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="恢复默认指数"
            >
              <ResetIcon width="16" height="16" />
            </button>
          )}
        </div>

        <div
          className="chips"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {allIndices.map((item) => {
            const active = selectedSet.has(item.code);
            return (
              <button
                key={item.code || item.name}
                type="button"
                onClick={() => handleToggleCode(item.code)}
                className={cn("chip", active && "active")}
                style={{
                  height: 30,
                  fontSize: 12,
                  padding: "0 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 16,
                }}
              >
                {item.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (!open) return null;

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onOpenChange={(v) => {
          if (!v) onClose?.();
        }}
        direction="bottom"
      >
        <DrawerContent
          className="glass"
          defaultHeight="77vh"
          minHeight="40vh"
          maxHeight="90vh"
        >
          <DrawerHeader className="flex flex-row items-center justify-between gap-2 py-4">
            <DrawerTitle className="flex items-center gap-2.5 text-left">
              <SettingsIcon width="20" height="20" />
              <span>指数个性化设置</span>
            </DrawerTitle>
            <DrawerClose
              className="icon-button border-none bg-transparent p-1"
              title="关闭"
              style={{
                borderColor: "transparent",
                backgroundColor: "transparent",
              }}
            >
              <CloseIcon width="20" height="20" />
            </DrawerClose>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto">{body}</div>
        </DrawerContent>
        <AnimatePresence>
          {resetConfirmOpen && (
            <ConfirmModal
              key="mobile-index-reset-confirm"
              title="恢复默认指数"
              message="是否恢复已添加指数为默认配置？"
              icon={
                <ResetIcon
                  width="20"
                  height="20"
                  className="shrink-0 text-[var(--primary)]"
                />
              }
              confirmVariant="primary"
              confirmText="恢复默认"
              onConfirm={() => {
                onResetDefault?.();
                setResetConfirmOpen(false);
              }}
              onCancel={() => setResetConfirmOpen(false)}
            />
          )}
        </AnimatePresence>
      </Drawer>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose?.();
      }}
    >
      <DialogContent
        className="!p-0 max-w-xl"
        overlayClassName="modal-overlay"
        showCloseButton={false}
      >
        <div className="glass card modal">
          <DialogHeader
            className="flex flex-row items-center justify-between gap-2 mb-3"
          >
            <div className="flex items-center gap-2.5">
              <SettingsIcon width="20" height="20" />
              <DialogTitle>指数个性化设置</DialogTitle>
            </div>
            <DialogClose asChild>
              <button
                type="button"
                className="icon-button border-none bg-transparent p-1"
                title="关闭"
              >
                <CloseIcon width="20" height="20" />
              </button>
            </DialogClose>
          </DialogHeader>
          <div
            className="flex flex-col gap-4"
            style={{ maxHeight: "70vh", overflowY: "auto" }}
          >
            {body}
          </div>
        </div>
        {resetConfirmOpen && (
          <ConfirmModal
            title="恢复默认指数"
            message="是否恢复已添加指数为默认配置？"
            icon={
              <ResetIcon
                width="20"
                height="20"
                className="shrink-0 text-[var(--primary)]"
              />
            }
            confirmVariant="primary"
            confirmText="恢复默认"
            onConfirm={() => {
              onResetDefault?.();
              setResetConfirmOpen(false);
            }}
            onCancel={() => setResetConfirmOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

