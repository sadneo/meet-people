import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { SkyGarden, type GardenState } from "./garden.js";
import { gardenFor } from './garden-state';
import { useCurrent } from './current';

export function Garden() {
  const current = useCurrent();
  const host = useRef<HTMLDivElement>(null),
    navigate = useNavigate();
  const state = useRef<GardenState>(gardenFor(current.session.user.id));
  useEffect(() => {
    host.current!.innerHTML = SkyGarden.html(state.current);
    Object.assign(window, {
      gardenNavigate: (page: string) =>
        navigate(page === "Messages" ? "/messages" : "/matchmaking"),
    });
    SkyGarden.mount(state.current);
    return () => {
      SkyGarden.dispose();
      Reflect.deleteProperty(window, "gardenNavigate");
    };
  }, [navigate]);
  return (
    <>
      <div ref={host} />
      <p id="garden-status" className="garden-status" role="status">
        Local garden · resets on refresh or sign-out
      </p>
    </>
  );
}
