import type { Component } from 'solid-js';
import Editor from '../components/editor/Editor';

interface NodeEditViewProps {
  sheetId: string;
}

const NodeEditView: Component<NodeEditViewProps> = (props) => {
  return <Editor sheetId={props.sheetId} />;
};

export default NodeEditView;
