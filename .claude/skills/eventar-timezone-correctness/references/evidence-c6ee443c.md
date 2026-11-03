          Times are in your local timezone. The event page will display them in
          the venue&apos;s local time.
        </p>
        <VenueTimeLine value={value} venueTz={venueTz} />
      </div>
    </div>
  );
}
...
      You entered {mine.time} in your time ({yours}, {mine.zone}). This event will show {theirs.time}