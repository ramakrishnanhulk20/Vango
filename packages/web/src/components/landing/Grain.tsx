import styles from "./Grain.module.css";

type GrainProps = {
  opacity?: number;
};

export default function Grain({ opacity = 0.06 }: GrainProps) {
  return <div aria-hidden className={styles.layer} style={{ opacity }} />;
}
