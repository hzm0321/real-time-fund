import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { CloseIcon } from './Icons';

export default function TutorialDrawer({ open, onOpenChange }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="glass" style={{ height: '95vh' }}>
        <DrawerHeader className="flex-shrink-0 flex flex-row items-center justify-between gap-2 space-y-0 px-5 pb-3 pt-4 text-left">
          <DrawerTitle className="text-base font-semibold text-[var(--text)]">使用帮助</DrawerTitle>
          <DrawerClose
            className="icon-button border-none bg-transparent p-1"
            title="关闭"
            style={{ borderColor: 'transparent', backgroundColor: 'transparent' }}
          >
            <CloseIcon width="20" height="20" />
          </DrawerClose>
        </DrawerHeader>
        <div style={{ flex: 1, width: '100%', height: '100%', overflow: 'hidden' }}>
          <iframe
            src="https://www.yuque.com/u267605/ookgim/im06q8tembbld6im?singleDoc"
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="使用帮助"
            frameBorder={0}
            allowFullScreen
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
